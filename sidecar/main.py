"""
Zettel sidecar — JSON-RPC over stdin/stdout.

Protocol: one JSON request line in, one JSON response line out per invocation.
The host (Tauri/Rust) spawns this process per command and closes stdin to signal
end-of-input. We read all of stdin, parse it as a single JSON object, and write
exactly one JSON object to stdout, then exit.

All log/diagnostic output goes to stderr — stdout is reserved for the response.
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

# Ensure local imports resolve when invoked from any cwd (dev: project root;
# release: PyInstaller _MEIPASS).
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

GTK_SENTINEL_DLL = "libgobject-2.0-0.dll"
GTK_DEFAULT_DIRS = (
    r"C:\Program Files\GTK3-Runtime Win64\bin",
    r"C:\Program Files\GTK3-Runtime Win64",
    r"C:\msys64\mingw64\bin",
)


def _gtk_candidate_dirs() -> list[str]:
    candidates = []
    override = os.environ.get("ZETTEL_GTK_PATH")
    if override:
        candidates.append(override)
    # Frozen (PyInstaller onedir): GTK DLLs are copied next to the executable
    # by build.py — prefer them over any system install so the bundle is
    # self-contained.
    if getattr(sys, "frozen", False):
        candidates.append(str(Path(sys.executable).parent))
    candidates.extend(GTK_DEFAULT_DIRS)
    return candidates


def _add_gtk_dll_path() -> None:
    """Make GTK runtime DLLs discoverable for WeasyPrint on Windows.

    GTK installers put DLLs in varying locations; PATH isn't always updated.
    Try the common paths and the optional ZETTEL_GTK_PATH override.
    """
    if sys.platform != "win32":
        return
    for path in _gtk_candidate_dirs():
        if not os.path.exists(os.path.join(path, GTK_SENTINEL_DLL)):
            continue
        try:
            os.add_dll_directory(path)
        except OSError:
            pass  # the PATH entry below is the fallback loader route
        os.environ["PATH"] = path + os.pathsep + os.environ.get("PATH", "")
        return


_add_gtk_dll_path()

from invoice.pdf import render_invoice_pdf, render_offer_pdf, render_reminder_pdf  # noqa: E402
from invoice.extract import extract_from_pdf, extract_xml_only  # noqa: E402
from invoice.text_extract import extract_text_heuristic  # noqa: E402
from bank.camt import detect_format, parse_camt053  # noqa: E402
from bank.mt940 import parse_mt940  # noqa: E402


class _RequestError(Exception):
    """A request that cannot be served; becomes an error response."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _err(code: str, message: str, details: str | None = None) -> dict:
    return {
        "success": False,
        "error": {"code": code, "message": message, "details": details or ""},
    }


def _require(payload: dict, key: str):
    value = payload.get(key)
    if not value:
        raise _RequestError("MISSING_FIELD", f"payload.{key} is required")
    return value


def _ping(_payload: dict) -> dict:
    return {"success": True, "pong": True}


def _generate_pdf(render: Callable[[dict], Path]) -> Callable[[dict], dict]:
    def handler(payload: dict) -> dict:
        try:
            output_path = render(payload)
        except KeyError as e:
            raise _RequestError("MISSING_FIELD", f"Missing required payload field: {e}") from e
        return {
            "success": True,
            "pdfPath": str(output_path),
            "validationWarnings": [],
            "validationErrors": [],
        }

    return handler


def _extract_zugferd(payload: dict) -> dict:
    return {"success": True, **extract_from_pdf(_require(payload, "pdfPath"))}


def _extract_xml_only(payload: dict) -> dict:
    # Raw Factur-X XML for the validator command, which feeds the bundled KoSIT
    # validator without re-parsing.
    return {"success": True, **extract_xml_only(_require(payload, "pdfPath"))}


def _extract_text_pdf(payload: dict) -> dict:
    return {"success": True, **extract_text_heuristic(_require(payload, "pdfPath"))}


def _parse_bank_statement(payload: dict) -> dict:
    path = _require(payload, "path")
    fmt = payload.get("format") or "auto"
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        content = fh.read()
    if fmt == "auto":
        fmt = detect_format(content)
    if fmt == "camt":
        bookings = parse_camt053(content)
    elif fmt == "mt940":
        bookings = parse_mt940(content)
    else:
        raise _RequestError("UNKNOWN_FORMAT", f"Unknown bank statement format: {fmt}")
    return {"success": True, "format": fmt, "bookings": bookings}


@dataclass(frozen=True)
class _Command:
    handler: Callable[[dict], dict]
    failure_code: str
    not_found_code: str | None = None


_COMMANDS = {
    "ping": _Command(_ping, "PING_FAILED"),
    "generate_invoice": _Command(
        _generate_pdf(render_invoice_pdf), "RENDER_FAILED", "TEMPLATE_NOT_FOUND"
    ),
    "generate_offer": _Command(
        _generate_pdf(render_offer_pdf), "RENDER_FAILED", "TEMPLATE_NOT_FOUND"
    ),
    "generate_reminder": _Command(
        _generate_pdf(render_reminder_pdf), "RENDER_FAILED", "TEMPLATE_NOT_FOUND"
    ),
    "extract_zugferd": _Command(_extract_zugferd, "EXTRACT_FAILED", "PDF_NOT_FOUND"),
    "extract_xml_only": _Command(_extract_xml_only, "EXTRACT_FAILED", "PDF_NOT_FOUND"),
    "extract_text_pdf": _Command(_extract_text_pdf, "EXTRACT_FAILED", "PDF_NOT_FOUND"),
    "parse_bank_statement": _Command(_parse_bank_statement, "PARSE_FAILED", "FILE_NOT_FOUND"),
}


def handle(req: dict) -> dict:
    command = req.get("command")
    spec = _COMMANDS.get(command) if isinstance(command, str) else None
    if spec is None:
        return _err("UNKNOWN_COMMAND", f"Unknown command: {command!r}")

    try:
        return spec.handler(req.get("payload") or {})
    except _RequestError as e:
        return _err(e.code, e.message)
    except FileNotFoundError as e:
        if spec.not_found_code:
            return _err(spec.not_found_code, str(e))
        return _err(spec.failure_code, str(e), traceback.format_exc())
    except Exception as e:
        return _err(spec.failure_code, str(e), traceback.format_exc())


def respond(raw_bytes: bytes) -> dict:
    if not raw_bytes.strip():
        return _err("EMPTY_REQUEST", "No input received on stdin")
    try:
        req = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        return _err("INVALID_JSON", f"Could not parse stdin as UTF-8 JSON: {e}")
    if not isinstance(req, dict):
        return _err("INVALID_JSON", "Request must be a JSON object")
    return handle(req)


def main() -> int:
    # Read/write raw UTF-8 bytes — Windows defaults to cp1252 which mangles
    # German characters in the JSON payload (and in any string we emit back).
    out = respond(sys.stdin.buffer.read())

    payload = json.dumps(out, ensure_ascii=False) + "\n"
    sys.stdout.buffer.write(payload.encode("utf-8"))
    sys.stdout.buffer.flush()
    return 0 if out.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())
