"""Cross-validation: every XML the Zettel sidecar emits MUST pass the bundled
KoSIT validator. If this test breaks, we shipped non-conformant XML — a
showstopper for the entire ZUGFeRD compliance story.

Skipped when the validator isn't installed (CI installs it, dev runs
`tools/download-validator.sh` once).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

from invoice.zugferd import render_zugferd_xml

TOOLS_DIR = Path(__file__).resolve().parents[2] / "tools"
VALIDATOR_DIR = TOOLS_DIR / "kosit-validator"
VALIDATOR_JAR = VALIDATOR_DIR / "validator.jar"
SCENARIOS = VALIDATOR_DIR / "scenarios.xml"
NS_REP = "{http://www.xoev.de/de/validator/varl/1}"


def _java() -> str | None:
    """Same lookup order as validator.rs in a dev build: bundled tools/jre first."""
    bundled = TOOLS_DIR / "jre" / "bin" / ("java.exe" if os.name == "nt" else "java")
    if bundled.exists():
        return str(bundled)
    return shutil.which("java")


JAVA = _java() or "java"


def _validator_available() -> bool:
    return VALIDATOR_JAR.exists() and SCENARIOS.exists() and _java() is not None


pytestmark = pytest.mark.skipif(
    not _validator_available(),
    reason="KoSIT validator not installed (run tools/download-validator.sh)",
)


def _run_validator(xml_path: Path, out_dir: Path) -> Path:
    # Feed an empty real file as stdin (not subprocess.DEVNULL → NUL on Windows,
    # which KoSIT misreads via FileInputStream.available() and crashes). Same
    # fix shipped in validator.rs / v0.16.1.
    stdin_path = out_dir / ".stdin-empty"
    stdin_path.write_bytes(b"")
    with stdin_path.open("rb") as stdin_f:
        subprocess.run(
            [
                JAVA, "-jar", str(VALIDATOR_JAR),
                "-s", str(SCENARIOS),
                "-r", str(VALIDATOR_DIR),
                "-o", str(out_dir),
                str(xml_path),
            ],
            check=False,
            capture_output=True,
            timeout=60,
            stdin=stdin_f,
        )
    return out_dir / f"{xml_path.stem}-report.xml"


def _is_valid(report_path: Path) -> tuple[bool, list[str]]:
    tree = ET.parse(report_path)
    root = tree.getroot()
    valid = root.get("valid") == "true"
    msgs: list[str] = []
    # collect any failed-assert text for diagnostic output
    for el in root.iter():
        if el.tag.endswith("failed-assert"):
            for child in el:
                if child.tag.endswith("text") and child.text:
                    msgs.append(child.text.strip())
    return valid, msgs


# NOTE: KoSIT XRechnung scenarios only validate against EN16931 / XRechnung URNs.
# Our `basic` and `extended` Factur-X profiles use distinct URNs
# (urn:factur-x.eu:1p0:basic / :extended) and need a different scenarios.xml
# (the upstream factur-x scenarios from KoSIT). Skipped here until we ship that.
@pytest.mark.parametrize("payload_name", [
    "01-standard-19.json",
    "02-mixed-vat.json",
    "03-five-positions.json",
    "04-ku-with-vatid.json",
])
def test_sidecar_xml_passes_kosit(payloads, payload_name, tmp_path):
    payload = payloads(payload_name)
    xml = render_zugferd_xml(payload)
    xml_file = tmp_path / "invoice.xml"
    xml_file.write_text(xml, encoding="utf-8")

    out_dir = tmp_path / "out"
    out_dir.mkdir()
    report = _run_validator(xml_file, out_dir)
    assert report.exists(), f"validator produced no report for {payload_name}"

    valid, msgs = _is_valid(report)
    assert valid, (
        f"{payload_name} REJECTED by KoSIT:\n"
        + "\n".join(f"  - {m}" for m in msgs[:10])
    )


def test_reverse_charge_intra_eu_passes_kosit(payloads, tmp_path):
    payload = payloads("05-reverse-charge.json")
    payload["invoice"]["reverseChargeType"] = "intra_eu"
    xml = render_zugferd_xml(payload)
    xml_file = tmp_path / "invoice.xml"
    xml_file.write_text(xml, encoding="utf-8")

    out_dir = tmp_path / "out"
    out_dir.mkdir()
    report = _run_validator(xml_file, out_dir)
    valid, msgs = _is_valid(report)
    assert valid, (
        "reverse-charge intra-EU REJECTED by KoSIT:\n"
        + "\n".join(f"  - {m}" for m in msgs[:10])
    )


def _credit_note(payloads, paid_cent: int) -> dict:
    payload = payloads("01-standard-19.json")
    invoice = payload["invoice"]
    invoice.update(
        isCreditNote=True,
        subtotal=-invoice["subtotal"],
        vatAmount=-invoice["vatAmount"],
        total=-invoice["total"],
        amountPaidCent=paid_cent,
    )
    return payload


@pytest.mark.parametrize("refunded_share", [0, 0.5, 1], ids=["unpaid", "partly-refunded", "refunded"])
def test_credit_note_passes_kosit(payloads, refunded_share, tmp_path):
    payload = _credit_note(payloads, paid_cent=0)
    payload["invoice"]["amountPaidCent"] = round(abs(payload["invoice"]["total"]) * refunded_share)
    xml_file = tmp_path / "credit-note.xml"
    xml_file.write_text(render_zugferd_xml(payload), encoding="utf-8")

    out_dir = tmp_path / "out"
    out_dir.mkdir()
    valid, msgs = _is_valid(_run_validator(xml_file, out_dir))
    assert valid, (
        f"credit note ({refunded_share:.0%} refunded) REJECTED by KoSIT:\n"
        + "\n".join(f"  - {m}" for m in msgs[:10])
    )
