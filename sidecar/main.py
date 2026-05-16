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
from pathlib import Path

# Ensure local imports resolve when invoked from any cwd (dev: project root;
# release: PyInstaller _MEIPASS).
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))


def _add_gtk_dll_path() -> None:
    """Make GTK runtime DLLs discoverable for WeasyPrint on Windows.

    GTK installers put DLLs in varying locations; PATH isn't always updated.
    Try the common paths and the optional ZETTEL_GTK_PATH override.
    """
    if sys.platform != "win32":
        return
    candidates = []
    override = os.environ.get("ZETTEL_GTK_PATH")
    if override:
        candidates.append(override)
    # Frozen (PyInstaller onedir): GTK DLLs are copied next to the executable
    # by build.py — prefer them over any system install so the bundle is
    # self-contained.
    if getattr(sys, "frozen", False):
        candidates.append(str(Path(sys.executable).parent))
    candidates += [
        r"C:\Program Files\GTK3-Runtime Win64\bin",
        r"C:\Program Files\GTK3-Runtime Win64",
        r"C:\msys64\mingw64\bin",
    ]
    for path in candidates:
        if os.path.isdir(path) and os.path.exists(
            os.path.join(path, "libgobject-2.0-0.dll")
        ):
            try:
                os.add_dll_directory(path)
            except (OSError, AttributeError):
                pass
            os.environ["PATH"] = path + os.pathsep + os.environ.get("PATH", "")
            return


_add_gtk_dll_path()

from invoice.pdf import render_invoice_pdf  # noqa: E402


def _err(code: str, message: str, details: str | None = None) -> dict:
    return {
        "success": False,
        "error": {"code": code, "message": message, "details": details or ""},
    }


def handle(req: dict) -> dict:
    command = req.get("command")
    payload = req.get("payload") or {}

    if command == "ping":
        return {"success": True, "pong": True}

    if command == "generate_invoice":
        try:
            output_path = render_invoice_pdf(payload)
            return {
                "success": True,
                "pdfPath": str(output_path),
                "validationWarnings": [],
                "validationErrors": [],
            }
        except FileNotFoundError as e:
            return _err("TEMPLATE_NOT_FOUND", str(e))
        except KeyError as e:
            return _err("MISSING_FIELD", f"Missing required payload field: {e}")
        except Exception as e:
            return _err(
                "RENDER_FAILED",
                str(e),
                traceback.format_exc(),
            )

    return _err("UNKNOWN_COMMAND", f"Unknown command: {command!r}")


def main() -> int:
    # Force UTF-8 on stdin/stdout — Windows defaults to cp1252 which mangles
    # German characters in the JSON payload (and in any string we emit back).
    raw_bytes = sys.stdin.buffer.read()
    if not raw_bytes.strip():
        out = _err("EMPTY_REQUEST", "No input received on stdin")
    else:
        try:
            raw = raw_bytes.decode("utf-8")
            req = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            out = _err("INVALID_JSON", f"Could not parse stdin as UTF-8 JSON: {e}")
        else:
            out = handle(req)

    payload = json.dumps(out, ensure_ascii=False) + "\n"
    sys.stdout.buffer.write(payload.encode("utf-8"))
    sys.stdout.buffer.flush()
    return 0 if out.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())
