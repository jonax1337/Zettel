"""End-to-end pipeline test: spawn the real sidecar over stdin/stdout, get a
real PDF/A-3 file with embedded ZUGFeRD XML, extract the XML back out, and
validate it against KoSIT. If this fails, the whole compliance promise breaks.

Slow (~10s per case) — runs `weasyprint` + Java validator. Skipped when
validator missing.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

SIDECAR_DIR = Path(__file__).resolve().parents[1]
ROOT = SIDECAR_DIR.parent
VALIDATOR_DIR = ROOT / "tools" / "kosit-validator"
PAYLOAD_DIR = SIDECAR_DIR / "test-payloads"


def _validator_available() -> bool:
    return (
        (VALIDATOR_DIR / "validator.jar").exists()
        and (VALIDATOR_DIR / "scenarios.xml").exists()
        and shutil.which("java") is not None
    )


pytestmark = pytest.mark.skipif(
    not _validator_available(),
    reason="KoSIT validator not installed",
)


def _python() -> str:
    """Resolve the sidecar's Python interpreter (venv preferred)."""
    if os.name == "nt":
        venv = SIDECAR_DIR / ".venv" / "Scripts" / "python.exe"
    else:
        venv = SIDECAR_DIR / ".venv" / "bin" / "python"
    return str(venv) if venv.exists() else sys.executable


def _run_sidecar(request: dict) -> dict:
    """Spawn sidecar/main.py the same way Rust does — stdin/stdout JSON."""
    proc = subprocess.run(
        [_python(), str(SIDECAR_DIR / "main.py")],
        input=json.dumps(request).encode("utf-8"),
        capture_output=True,
        timeout=60,
        cwd=str(SIDECAR_DIR),
    )
    if not proc.stdout.strip():
        raise RuntimeError(f"sidecar returned nothing. stderr:\n{proc.stderr.decode('utf-8', 'replace')}")
    return json.loads(proc.stdout.decode("utf-8"))


def _validate_xml(xml_path: Path, out_dir: Path) -> tuple[bool, list[str]]:
    # Real empty file as stdin — KoSIT's available() check explodes on NUL on
    # Windows (same bug fixed in validator.rs / v0.16.1).
    stdin_path = out_dir / ".stdin-empty"
    stdin_path.write_bytes(b"")
    with stdin_path.open("rb") as stdin_f:
        subprocess.run(
            [
                "java", "-jar", str(VALIDATOR_DIR / "validator.jar"),
                "-s", str(VALIDATOR_DIR / "scenarios.xml"),
                "-r", str(VALIDATOR_DIR),
                "-o", str(out_dir),
                str(xml_path),
            ],
            capture_output=True, timeout=60, stdin=stdin_f,
        )
    report = out_dir / f"{xml_path.stem}-report.xml"
    if not report.exists():
        return False, ["no report produced"]
    root = ET.parse(report).getroot()
    valid = root.get("valid") == "true"
    msgs = [
        (el.text or "").strip()
        for el in root.iter()
        if el.tag.endswith("message") and el.text
    ]
    return valid, msgs[:5]


@pytest.mark.parametrize("payload_file", [
    "01-standard-19.json",
    "02-mixed-vat.json",
    "03-five-positions.json",
    "04-ku-with-vatid.json",
    "05-reverse-charge.json",
])
def test_generate_then_validate_pdf(payload_file, tmp_path):
    raw = json.loads((PAYLOAD_DIR / payload_file).read_text("utf-8"))
    payload = raw["payload"]

    # Standard payloads already declare an outputPath relative to sidecar/.
    # Override to land in tmp_path so the test is hermetic.
    pdf_path = tmp_path / "invoice.pdf"
    payload["outputPath"] = str(pdf_path)

    # 05-reverse-charge needs reverseChargeType (payload only has isReverseCharge flag)
    if payload_file == "05-reverse-charge.json":
        payload["invoice"]["reverseChargeType"] = "intra_eu"

    response = _run_sidecar({"command": "generate_invoice", "payload": payload})
    assert response.get("success") is True, f"sidecar failed: {response}"
    assert pdf_path.exists(), "PDF was not written"
    assert pdf_path.stat().st_size > 5000, "PDF unrealistically small"

    # Extract embedded XML and validate.
    extract = _run_sidecar({
        "command": "extract_xml_only",
        "payload": {"pdfPath": str(pdf_path)},
    })
    assert extract.get("success") is True
    assert extract.get("found") is True, "PDF/A-3 attachment missing — Factur-X broken"
    xml = extract["xml"]
    assert "<rsm:CrossIndustryInvoice" in xml

    xml_path = tmp_path / "invoice.xml"
    xml_path.write_text(xml, encoding="utf-8")
    out = tmp_path / "out"
    out.mkdir()
    valid, msgs = _validate_xml(xml_path, out)
    assert valid, (
        f"Generated PDF for {payload_file} is NOT EN16931-conformant:\n"
        + "\n".join(f"  - {m}" for m in msgs)
    )


def test_ping_sidecar():
    """Sanity: spawning the sidecar with ping returns pong."""
    response = _run_sidecar({"command": "ping"})
    assert response.get("success") is True
    assert response.get("pong") is True
