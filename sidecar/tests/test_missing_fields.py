"""Exploration: what happens when an invoice payload is incomplete?

Three failure modes, distinguished here so the UI can give useful guidance:

1. **Hard-required** — sidecar raises KeyError; PDF never gets written.
   The TS layer sees `success: false, error.code = MISSING_FIELD`.
2. **XSD-rejected** — XML renders but EN16931 schema rejects it.
   Validator step val-xsd reports valid=false.
3. **Schematron-rejected** — XML renders, XSD passes, but a business rule
   fails. Validator step val-sch.1 reports valid=false with BR-XX-NN code.

These tests document the boundary. They run XML-rendering only (no PDF or
sidecar process), so they're cheap; the KoSIT step is the slow part.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

from invoice.zugferd import render_zugferd_xml

ROOT = Path(__file__).resolve().parents[2]
VAL = ROOT / "tools" / "kosit-validator"
PAYLOAD = ROOT / "sidecar/test-payloads/01-standard-19.json"


def _validator_available() -> bool:
    return (
        (VAL / "validator.jar").exists()
        and shutil.which("java") is not None
    )


def _load_payload() -> dict:
    return json.loads(PAYLOAD.read_text("utf-8"))["payload"]


def _validate(xml: str, tmp_path: Path) -> dict:
    xf = tmp_path / "inv.xml"
    xf.write_text(xml, encoding="utf-8")
    out = tmp_path / "out"
    out.mkdir(exist_ok=True)
    # Empty real file as stdin — see test_end_to_end.py / v0.16.1 for the why.
    stdin_path = out / ".stdin-empty"
    stdin_path.write_bytes(b"")
    with stdin_path.open("rb") as stdin_f:
        subprocess.run(
            ["java", "-jar", str(VAL / "validator.jar"),
             "-s", str(VAL / "scenarios.xml"),
             "-r", str(VAL), "-o", str(out), str(xf)],
            capture_output=True, timeout=60, stdin=stdin_f,
        )
    rep = next(out.glob("*-report.xml"), None)
    if not rep:
        return {"valid": False, "errors": ["no report"], "step_xsd": None, "step_sch": None}
    root = ET.parse(rep).getroot()
    valid = root.get("valid") == "true"
    steps: dict[str, bool] = {}
    msgs: list[str] = []
    for el in root.iter():
        if el.tag.endswith("validationStepResult"):
            steps[el.get("id", "?")] = el.get("valid") == "true"
        if el.tag.endswith("message") and el.text:
            text = el.text.strip()
            code_match = re.search(r"\[(BR-[A-Z0-9-]+)\]", text)
            msgs.append(code_match.group(1) if code_match else text[:80])
    return {
        "valid": valid,
        "errors": msgs[:5],
        "step_xsd": steps.get("val-xsd"),
        "step_sch": steps.get("val-sch.1"),
    }


# ---------- (1) Hard-required: sidecar level ----------

@pytest.mark.parametrize("delete_path", [
    ("invoice",),
    ("items",),
    ("company",),
    ("customer",),
])
def test_missing_top_level_section_raises_keyerror(delete_path):
    """The zugferd renderer crashes immediately if a top-level section is gone."""
    payload = _load_payload()
    del payload[delete_path[0]]
    with pytest.raises(KeyError):
        render_zugferd_xml(payload)


@pytest.mark.parametrize("section,field,tag", [
    ("invoice", "number", "ram:ID"),
    ("customer", "city", "ram:CityName"),
])
def test_missing_value_does_not_render_as_literal_none(section, field, tag):
    payload = _load_payload()
    payload[section][field] = None
    xml = render_zugferd_xml(payload)
    assert f"<{tag}>None</{tag}>" not in xml


def test_missing_issue_date_fails_br_03(tmp_path):
    """Issue date drops to an empty <udt:DateTimeString>. The XSD lets it pass;
    Schematron rejects it (BR-03, CII-DT-097)."""
    if not _validator_available():
        pytest.skip("validator missing")
    payload = _load_payload()
    payload["invoice"]["issueDate"] = None
    xml = render_zugferd_xml(payload)
    result = _validate(xml, tmp_path)
    assert not result["valid"]
    assert any("BR-03" in e for e in result["errors"]), result["errors"]


# ---------- (2) Schematron-level: missing semantic fields ----------

def test_missing_seller_vatid_and_taxnumber_fails_br_co_26(tmp_path):
    """BR-CO-26: seller must be identifiable. Stripping both VAT-ID and
    tax number triggers it."""
    if not _validator_available():
        pytest.skip("validator missing")
    payload = _load_payload()
    payload["company"]["vatId"] = None
    payload["company"]["taxNumber"] = None
    xml = render_zugferd_xml(payload)
    result = _validate(xml, tmp_path)
    assert not result["valid"]
    assert any("BR-CO-26" in e for e in result["errors"]), (
        f"expected BR-CO-26 in errors, got {result['errors']}"
    )


def test_kleinunternehmer_without_vatid_still_passes(tmp_path):
    """The taxNumber fallback in the template covers BR-CO-26 for KU users
    who legitimately don't have a USt-IdNr. The totals must reflect KU
    (0% VAT) for BR-CO-14 to also pass — this is what the UI does when
    isKleinunternehmer is toggled."""
    if not _validator_available():
        pytest.skip("validator missing")
    payload = _load_payload()
    payload["company"]["vatId"] = None
    payload["company"]["isKleinunternehmer"] = True
    payload["invoice"]["isKleinunternehmer"] = True
    # Recompute totals as the real form would when KU is enabled.
    payload["invoice"]["vatAmount"] = 0
    payload["invoice"]["total"] = payload["invoice"]["subtotal"]
    xml = render_zugferd_xml(payload)
    result = _validate(xml, tmp_path)
    assert result["valid"], f"KU fallback should pass, got: {result['errors']}"


def test_missing_customer_country_renders_de_fallback():
    payload = _load_payload()
    payload["customer"]["country"] = None
    xml = render_zugferd_xml(payload)
    buyer = ET.fromstring(xml).find(".//{*}BuyerTradeParty")
    assert buyer.find(".//{*}CountryID").text == "DE"


def test_missing_customer_country_is_accepted_via_de_fallback(tmp_path):
    """The template emits CountryID DE (element text) when customer.country is
    None, so the validator never sees the gap. The UI must enforce
    customer.country at form level — DE may be wrong for foreign buyers."""
    if not _validator_available():
        pytest.skip("validator missing")
    payload = _load_payload()
    payload["customer"]["country"] = None
    xml = render_zugferd_xml(payload)
    result = _validate(xml, tmp_path)
    assert result["valid"], "validator no longer accepts the fallback — UI check can relax"


def test_empty_items_list_renders_but_validator_rejects(tmp_path):
    """Invoice without line items violates BR-16 (at least one line); the
    XSD may reject the missing line-item element before Schematron runs."""
    if not _validator_available():
        pytest.skip("validator missing")
    payload = _load_payload()
    payload["items"] = []
    xml = render_zugferd_xml(payload)
    # The renderer accepts empty items (returns 0-vat-group fallback), but the
    # XML produced will be rejected at validation time.
    result = _validate(xml, tmp_path)
    assert not result["valid"]
    assert result["step_xsd"] is False or any("BR-16" in e for e in result["errors"]), result
