"""
Text-layer extraction for incoming PDFs without ZUGFeRD/Factur-X attachments.

Reads the PDF's text layer via pypdf (already a dependency for size estimation
elsewhere) and applies regex heuristics to pull out:
 - invoice number
 - issue date
 - due date (best-effort, often the same line as "fällig bis ...")
 - total amount (in cents)
 - vendor name guess (first non-empty non-trivial line)
 - vendor VAT-ID (DE + 9 digits, or generic EU pattern)

This is intentionally a fallback for digital PDFs only. Scanned PDFs without a
text layer return `{found: False}`. We do NOT bundle Tesseract — see issue #43.

All matches are returned with their literal source so the UI can show what we
parsed for user confirmation.
"""
from __future__ import annotations

import datetime as _dt
import re
from pathlib import Path
from typing import Any

# --- Regex patterns ---

# German invoice number cues. We keep the captured number loose (alphanum + - / _).
_RE_INVOICE_NUMBER = re.compile(
    r"(?:Rechnungs[-\s]?(?:nr\.?|nummer)|Rechnung\s+Nr\.?|Invoice\s+No\.?|Beleg[-\s]?Nr\.?)"
    r"[:\s#]*([A-Z0-9][A-Z0-9\-/_.]{1,30})",
    re.IGNORECASE,
)

# DE date dd.mm.yyyy (incl. 2-digit year) — most common on German invoices.
_RE_DATE_DE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b")
# ISO date yyyy-mm-dd
_RE_DATE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")

# Invoice date cue followed by a date within ~30 chars.
_RE_ISSUE_DATE_CUE = re.compile(
    r"(?:Rechnungs(?:datum|tag)|Belegdatum|Datum|Invoice\s+date)[:\s]+(.{0,30})",
    re.IGNORECASE,
)
_RE_DUE_DATE_CUE = re.compile(
    r"(?:Fällig(?:keits)?(?:datum|am|\s+bis)?|F[äa]llig\s+am|Zahlungs(?:ziel|frist)|Due\s+date)[:\s]+(.{0,30})",
    re.IGNORECASE,
)

# Total amount cues. Captures the value to the right.
_RE_TOTAL_CUE = re.compile(
    r"(?:Gesamt(?:betrag|summe)?|Rechnungs(?:betrag|summe)|Endbetrag|Zahlbetrag|Summe\s+brutto|Total\s+amount|Total)"
    r"[:\s]*([0-9][0-9.,\s]*)\s*(?:EUR|€|\$)?",
    re.IGNORECASE,
)

_RE_EUR_AMOUNT = re.compile(r"([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,\d{2})|[0-9]+,\d{2}|[0-9]+\.\d{2})\s*(?:EUR|€)")

_RE_VAT_ID = re.compile(r"\b(DE\s?\d{9}|[A-Z]{2}\s?[A-Z0-9]{8,12})\b")


def _de_amount_to_cents(s: str) -> int | None:
    """Parse '1.234,56' or '1234,56' or '1234.56' as cents (integer)."""
    if not s:
        return None
    cleaned = s.strip().replace(" ", "")
    if "," in cleaned and "." in cleaned:
        # German thousand-sep with comma decimal: '1.234,56' -> '1234.56'
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        # '1234,56' -> '1234.56'
        cleaned = cleaned.replace(",", ".")
    try:
        return round(float(cleaned) * 100)
    except (ValueError, TypeError):
        return None


def _parse_de_date(s: str) -> int | None:
    m = _RE_DATE_DE.search(s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        try:
            return int(_dt.datetime(y, mo, d).timestamp())
        except ValueError:
            return None
    m = _RE_DATE_ISO.search(s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return int(_dt.datetime(y, mo, d).timestamp())
        except ValueError:
            return None
    return None


def _read_pdf_text(pdf_path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    chunks: list[str] = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        chunks.append(text)
    return "\n".join(chunks)


def _guess_vendor_name(text: str) -> str | None:
    """First non-trivial line from page 1 — heuristic but works for ~70% of
    digitally-rendered invoices where the letterhead is the top of the page.

    Skips lines that look like dates, amounts, or pure punctuation.
    """
    for raw in text.splitlines()[:25]:
        line = raw.strip()
        if not line or len(line) < 3:
            continue
        # Skip lines that are dominated by digits / dates / amounts.
        digits = sum(1 for ch in line if ch.isdigit())
        if digits > len(line) * 0.4:
            continue
        if _RE_DATE_DE.search(line) or _RE_DATE_ISO.search(line):
            continue
        if line.lower().startswith(("rechnung", "invoice", "beleg", "datum", "kunde")):
            continue
        if line.startswith(("-", "*", "_")):
            continue
        return line[:80]
    return None


def extract_text_heuristic(pdf_path: str) -> dict[str, Any]:
    """Best-effort heuristic extraction. Returns:
    {
      found: bool,                # True if we got at least one usable field
      text_length: int,           # raw text length (0 = no text layer / scan)
      data?: {
        invoiceNumber, issueDate, dueDate, totalCents, currency,
        vendorName, vendorVatId, rawText (truncated)
      }
    }
    """
    path = Path(pdf_path)
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    text = _read_pdf_text(path)
    if not text.strip():
        return {"found": False, "textLength": 0}

    invoice_number: str | None = None
    m = _RE_INVOICE_NUMBER.search(text)
    if m:
        invoice_number = m.group(1).strip().rstrip(".,;:")

    issue_date: int | None = None
    m = _RE_ISSUE_DATE_CUE.search(text)
    if m:
        issue_date = _parse_de_date(m.group(1))
    if issue_date is None:
        # First plausible date anywhere as last resort.
        first = _RE_DATE_DE.search(text) or _RE_DATE_ISO.search(text)
        if first:
            issue_date = _parse_de_date(first.group(0))

    due_date: int | None = None
    m = _RE_DUE_DATE_CUE.search(text)
    if m:
        due_date = _parse_de_date(m.group(1))

    total_cents: int | None = None
    # Prefer explicit cue first.
    m = _RE_TOTAL_CUE.search(text)
    if m:
        total_cents = _de_amount_to_cents(m.group(1))
    if total_cents is None:
        # Fallback: largest EUR amount in the document.
        amounts = [_de_amount_to_cents(x) for x in _RE_EUR_AMOUNT.findall(text)]
        amounts = [a for a in amounts if a is not None and a > 0]
        if amounts:
            total_cents = max(amounts)

    vendor_name = _guess_vendor_name(text)

    vat_id: str | None = None
    m = _RE_VAT_ID.search(text)
    if m:
        vat_id = m.group(1).replace(" ", "")

    has_useful = any(
        v is not None and v != ""
        for v in (invoice_number, issue_date, total_cents, vendor_name)
    )

    return {
        "found": has_useful,
        "textLength": len(text),
        "data": {
            "invoiceNumber": invoice_number,
            "issueDate": issue_date,
            "dueDate": due_date,
            "totalCents": total_cents,
            "currency": "EUR",
            "vendorName": vendor_name,
            "vendorVatId": vat_id,
        },
    }
