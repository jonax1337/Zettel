# Zettel Sidecar

Python sidecar that turns invoice JSON into a PDF via Jinja2 + WeasyPrint, renders the ZUGFeRD/XRechnung XML, reads incoming e-invoices and parses bank statements (CAMT.053, MT940). The commands are listed in `main.py` (`generate_invoice`, `generate_offer`, `generate_reminder`, `generate_preview`, `render_document_html`, `generate_xrechnung`, `extract_zugferd`, `extract_xml_only`, `extract_text_pdf`, `parse_bank_statement`, `ping`).

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

`ping` is for diagnostics: it loads WeasyPrint (the PDF commands import it lazily, so the build smoke test would otherwise miss a bundle that cannot render) and returns `{"success": true, "pong": true}`.

`generate_preview` takes the payload of `generate_invoice` or `generate_offer` plus `kind` (`invoice` or `offer`) and a non-empty `outputPath`, and writes a draft PDF of the document there; it returns `{"success": true, "pdfPath": …}` like the other PDF commands. The PDF comes from the same templates and the engine of `settings.pdf_renderer` (WeasyPrint or Typst), but

- every page carries a diagonal "ENTWURF" watermark, centred on the sheet (a page background in WeasyPrint, a page foreground in Typst), so page breaks match the issued PDF;
- it carries no payment QR code (EPC): a banking app would turn it into a real transfer for a document that does not exist;
- no ZUGFeRD/Factur-X XML is embedded and the file is not PDF/A: a watermarked draft must not pass for an archival or e-invoice document.

The caller puts the number to show into `invoice.number`; the app passes "Entwurf #<4 hex>" for a draft that was never numbered. The only file the command leaves behind is `outputPath` (Typst also compiles in a temporary working directory, as it does for issued PDFs, which it removes afterwards). The app lets the host choose that path in its cache folder (never the documents folder) and clears the previews when it starts and exits, so a preview is never archived, versioned or recorded.

`render_document_html` takes the payload of a `generate_*` command plus `kind` (`invoice`, `offer`, `reminder`) and returns `{"success": true, "html": …}`: the same template as the PDF as one self-contained HTML sheet for the app. It writes nothing to disk and does not load WeasyPrint.

## Bundling

`build.py` produces a standalone, redistributable bundle at
`sidecar/dist/zettel-sidecar/` (onedir). Tauri's `bundle.resources` ships the
whole folder into the installer; at runtime the Rust side spawns the bundled
`zettel-sidecar(.exe)` directly. Dev builds keep using the venv + `main.py`.

```powershell
.\.venv\Scripts\Activate.ps1
pip install pyinstaller==6.22.3
python build.py
```

On Windows, every `.dll` from the GTK3-Runtime install directory is copied next
to the executable so the bundle works on machines without GTK installed.
On Linux/macOS, WeasyPrint loads Pango/Cairo from system libs — users need
`apt install libpango1.0-0 libcairo2` or `brew install pango cairo`. Bundling
those is a Phase-2 nice-to-have.
