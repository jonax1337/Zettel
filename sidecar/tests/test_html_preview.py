"""The on-screen sheet: the PDF templates as one self-contained HTML document."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

import main

from .document_payloads import offer_payload, reminder_payload

SIDECAR_DIR = Path(__file__).resolve().parent.parent
INVOICE_NUMBER = "RE-2026-TEST-01"


def _payloads(payloads) -> dict[str, dict]:
    invoice = payloads("01-standard-19.json")
    return {
        "invoice": invoice,
        "offer": offer_payload(invoice),
        "reminder": reminder_payload(invoice),
    }


def _request(kind: str, payload: dict) -> dict:
    return {"command": "render_document_html", "payload": {**payload, "kind": kind}}


@pytest.mark.parametrize(
    "kind,number",
    [("invoice", INVOICE_NUMBER), ("offer", "AN-1"), ("reminder", "MA-1")],
)
def test_every_kind_renders_a_sheet_with_its_document_number(payloads, kind, number):
    response = main.handle(_request(kind, _payloads(payloads)[kind]))

    assert response["success"] is True
    assert number in response["html"]


def test_sheet_inlines_both_stylesheets_after_the_template(payloads):
    html = main.handle(_request("invoice", _payloads(payloads)["invoice"]))["html"]

    assert html.count("<style>") == 1
    assert html.index("DIN 5008 form B on A4") < html.index("Screen shim for the HTML preview")
    assert html.index("</style>") < html.index("</head>")


@pytest.mark.parametrize("kind", ["invoice", "offer", "reminder"])
def test_sheet_references_nothing_external(payloads, kind):
    html = main.handle(_request(kind, _payloads(payloads)[kind]))["html"]

    assert not re.search(r"<(link|script)\b", html)
    assert not re.search(r"(?:src|href)\s*=\s*(?![\"']?data:)", html)
    assert not re.search(r"url\(\s*(?![\"']?data:)", html)


def test_shim_places_every_running_element_of_the_pdf_stylesheet():
    """A selector left running would fall into the document flow of the sheet."""
    templates = SIDECAR_DIR / "templates"
    without_comments = lambda css: re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    pdf_css = without_comments((templates / "invoice.css").read_text(encoding="utf-8"))
    shim = without_comments((templates / "preview.css").read_text(encoding="utf-8"))
    running = {
        selector.strip()
        for selectors in re.findall(r"([^{}]+)\{[^{}]*position:\s*running\(", pdf_css)
        for selector in selectors.split(",")
    }
    placed = {
        selector.strip()
        for selectors in re.findall(r"([^{}]+)\{[^{}]*(?:position:\s*absolute|display:\s*none)", shim)
        for selector in selectors.split(",")
    }

    assert running, "invoice.css no longer has running elements; the shim needs a review"
    assert running <= placed


def test_sheet_writes_nothing_to_disk(payloads, tmp_path):
    payload = _payloads(payloads)["invoice"]
    payload["outputPath"] = str(tmp_path / "out" / "invoice.pdf")

    assert main.handle(_request("invoice", payload))["success"] is True
    assert list(tmp_path.iterdir()) == []


def test_sheet_needs_no_output_path(payloads):
    payload = _payloads(payloads)["invoice"]
    payload.pop("outputPath", None)

    assert main.handle(_request("invoice", payload))["success"] is True


def test_unknown_kind_is_rejected(payloads):
    response = main.handle(_request("receipt", _payloads(payloads)["invoice"]))

    assert response["error"]["code"] == "INVALID_KIND"


def test_missing_kind_is_rejected(payloads):
    request = {"command": "render_document_html", "payload": _payloads(payloads)["invoice"]}

    assert main.handle(request)["error"]["code"] == "MISSING_FIELD"


def test_missing_document_data_is_reported_as_missing_field():
    assert main.handle(_request("invoice", {}))["error"]["code"] == "MISSING_FIELD"


def test_rendering_a_sheet_does_not_load_weasyprint(payloads):
    """The sidecar starts once per call; WeasyPrint alone costs over a second."""
    script = (
        "import json, sys\n"
        f"sys.path.insert(0, {str(SIDECAR_DIR)!r})\n"
        "import main\n"
        "assert main.handle(json.loads(sys.stdin.read()))['success']\n"
        "print('weasyprint' in sys.modules)\n"
    )
    request = _request("invoice", _payloads(payloads)["invoice"])

    run = subprocess.run(
        [sys.executable, "-c", script],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )

    assert run.stdout.strip() == "False"
