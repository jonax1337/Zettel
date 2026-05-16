# Zettel Sidecar

Python sidecar that turns invoice JSON into a PDF via Jinja2 + WeasyPrint.

## Setup (Windows, dev)

1. **Install Python 3.12** from https://www.python.org/downloads/release/python-3128/ (NOT MS Store). During install: check "Add python.exe to PATH".
2. **Install GTK runtime for WeasyPrint** — https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases/latest (download `gtk3-runtime-*-installer.exe`). Default install location is fine.
3. From the project root, create a venv inside `sidecar/`:

```powershell
cd sidecar
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

(Or use `python` instead of `py -3.12` if only one Python is installed.)

4. **Smoke test** — pipe a request:

```powershell
Get-Content test-payload.json -Raw | python main.py
```

Should print `{"success": true, "pdfPath": "..."}`. The PDF lands at the path you specified in the payload.

## Protocol

stdin: one JSON object. stdout: one JSON object. stderr: free for log output.

Request:
```json
{
  "command": "generate_invoice",
  "payload": {
    "invoice": { ... },
    "items": [ ... ],
    "company": { ... },
    "customer": { ... },
    "outputPath": "/abs/path/to/output.pdf"
  }
}
```

Success response:
```json
{ "success": true, "pdfPath": "/abs/path/to/output.pdf",
  "validationWarnings": [], "validationErrors": [] }
```

Error response:
```json
{ "success": false,
  "error": { "code": "RENDER_FAILED", "message": "...", "details": "..." } }
```

`ping` is a no-op for diagnostics: returns `{"success": true, "pong": true}`.

## Bundling

`build.py` produces a standalone, redistributable bundle at
`sidecar/dist/zettel-sidecar/` (onedir). Tauri's `bundle.resources` ships the
whole folder into the installer; at runtime the Rust side spawns the bundled
`zettel-sidecar(.exe)` directly. Dev builds keep using the venv + `main.py`.

```powershell
.\.venv\Scripts\Activate.ps1
pip install pyinstaller==6.11.1
python build.py
```

On Windows, every `.dll` from the GTK3-Runtime install directory is copied next
to the executable so the bundle works on machines without GTK installed.
On Linux/macOS, WeasyPrint loads Pango/Cairo from system libs — users need
`apt install libpango1.0-0 libcairo2` or `brew install pango cairo`. Bundling
those is a Phase-2 nice-to-have.
