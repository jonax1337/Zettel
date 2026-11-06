"""Request routing and error codes of the JSON-RPC entry point (main.py).

The host (Rust) branches on `error.code`, so every code stays pinned here.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

import main


def _error_code(response: dict) -> str:
    assert response["success"] is False
    return response["error"]["code"]


def test_ping():
    assert main.handle({"command": "ping"}) == {"success": True, "pong": True}


def test_unknown_command():
    assert _error_code(main.handle({"command": "nope"})) == "UNKNOWN_COMMAND"


def test_unhashable_command_is_unknown_not_a_crash():
    assert _error_code(main.handle({"command": ["ping"]})) == "UNKNOWN_COMMAND"


@pytest.mark.parametrize("command", ["extract_zugferd", "extract_xml_only", "extract_text_pdf"])
def test_extract_commands_require_pdf_path(command):
    assert _error_code(main.handle({"command": command, "payload": {}})) == "MISSING_FIELD"


@pytest.mark.parametrize("command", ["extract_zugferd", "extract_xml_only", "extract_text_pdf"])
def test_extract_commands_report_missing_file(command, tmp_path):
    request = {"command": command, "payload": {"pdfPath": str(tmp_path / "missing.pdf")}}
    assert _error_code(main.handle(request)) == "PDF_NOT_FOUND"


@pytest.mark.parametrize("command", ["generate_invoice", "generate_offer", "generate_reminder", "generate_xrechnung"])
def test_generate_commands_report_missing_payload_field(command):
    assert _error_code(main.handle({"command": command, "payload": {}})) == "MISSING_FIELD"


def test_generate_xrechnung_writes_the_xml_file(tmp_path):
    payload_file = Path(__file__).parent.parent / "test-payloads" / "08-xrechnung-standard-19.json"
    payload = json.loads(payload_file.read_text(encoding="utf-8"))["payload"]
    target = tmp_path / "Rechnungen" / "RE-2026-XR-01.xml"
    payload["outputPath"] = str(target)
    response = main.handle({"command": "generate_xrechnung", "payload": payload})
    assert response["success"] is True
    assert Path(response["xmlPath"]) == target.resolve()
    assert "xrechnung_3.0" in target.read_text(encoding="utf-8")


def test_bank_statement_requires_path():
    assert _error_code(main.handle({"command": "parse_bank_statement"})) == "MISSING_FIELD"


def test_bank_statement_missing_file(tmp_path):
    request = {"command": "parse_bank_statement", "payload": {"path": str(tmp_path / "x.xml")}}
    assert _error_code(main.handle(request)) == "FILE_NOT_FOUND"


def test_bank_statement_unknown_format(tmp_path):
    statement = tmp_path / "statement.txt"
    statement.write_text("irrelevant", encoding="utf-8")
    request = {"command": "parse_bank_statement", "payload": {"path": str(statement), "format": "csv"}}
    assert _error_code(main.handle(request)) == "UNKNOWN_FORMAT"


def test_bank_statement_parse_failure_is_reported(tmp_path):
    statement = tmp_path / "broken.xml"
    statement.write_text("<Document>", encoding="utf-8")
    request = {"command": "parse_bank_statement", "payload": {"path": str(statement), "format": "camt"}}
    response = main.handle(request)
    assert _error_code(response) == "PARSE_FAILED"
    assert response["error"]["details"]


class TestRespond:
    def test_empty_input(self):
        assert _error_code(main.respond(b"  \n")) == "EMPTY_REQUEST"

    def test_invalid_json(self):
        assert _error_code(main.respond(b"{not json")) == "INVALID_JSON"

    def test_invalid_utf8(self):
        assert _error_code(main.respond(b"\xff\xfe")) == "INVALID_JSON"

    def test_non_object_request_is_rejected_not_a_crash(self):
        assert _error_code(main.respond(b"[1, 2]")) == "INVALID_JSON"

    def test_roundtrip(self):
        assert main.respond(json.dumps({"command": "ping"}).encode("utf-8"))["pong"] is True
