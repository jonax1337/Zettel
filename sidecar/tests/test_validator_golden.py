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

VALIDATOR_DIR = Path(__file__).resolve().parents[2] / "tools" / "kosit-validator"
VALIDATOR_JAR = VALIDATOR_DIR / "validator.jar"
SCENARIOS = VALIDATOR_DIR / "scenarios.xml"
NS_REP = "{http://www.xoev.de/de/validator/varl/1}"


def _validator_available() -> bool:
    return (
        VALIDATOR_JAR.exists()
        and SCENARIOS.exists()
        and shutil.which("java") is not None
    )


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
                "java", "-jar", str(VALIDATOR_JAR),
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
