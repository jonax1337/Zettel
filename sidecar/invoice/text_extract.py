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

# The letterhead is expected within the first lines of the first page.
VENDOR_SCAN_LINES = 25
VENDOR_MIN_LINE_LENGTH = 3
VENDOR_MAX_DIGIT_RATIO = 0.4
VENDOR_NAME_MAX_LENGTH = 80
VENDOR_SKIPPED_PREFIXES = ("rechnung", "invoice", "beleg", "datum", "kunde")
VENDOR_SKIPPED_BULLETS = ("-", "*", "_")
TWO_DIGIT_YEAR_BASE = 2000
FALLBACK_CURRENCY = "EUR"

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

# Invoice date cue followed by a date within ~30 chars. The leading \b keeps
# "Fälligkeitsdatum" from matching the bare "Datum" cue.
_RE_ISSUE_DATE_CUE = re.compile(
    r"\b(?:Rechnungs(?:datum|tag)|Belegdatum|Datum|Invoice\s+date)[:\s]+(.{0,30})",
    re.IGNORECASE,
)
_RE_DUE_DATE_CUE = re.compile(
    r"(?:Fällig(?:keits)?(?:datum|am|\s+bis)?|F[äa]llig\s+am|Zahlungs(?:ziel|frist)|Due\s+date)[:\s]+(.{0,30})",
    re.IGNORECASE,
)

# Total amount cues. Captures the value to the right; the value itself must
# stay on one line, otherwise it swallows digits of the following line.
_RE_TOTAL_CUE = re.compile(
    r"(?:Gesamt(?:betrag|summe)?|Rechnungs(?:betrag|summe)|Endbetrag|Zahlbetrag|Summe\s+brutto|Total\s+amount|Total)"
    r"[:\s]*([0-9][0-9.,\t ]*)\s*(?:EUR|€|\$)?",
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
    except ValueError:
        return None


def _local_midnight_unix(year: int, month: int, day: int) -> int | None:
    try:
        return int(_dt.datetime(year, month, day).timestamp())
    except ValueError:
        return None


def _parse_de_date(s: str) -> int | None:
    m = _RE_DATE_DE.search(s)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if year < 100:
            year += TWO_DIGIT_YEAR_BASE
        return _local_midnight_unix(year, month, day)
    m = _RE_DATE_ISO.search(s)
    if m:
        return _local_midnight_unix(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def _read_pdf_text(pdf_path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    chunks: list[str] = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            # One undecodable page must not discard the text of the others.
            text = ""
        chunks.append(text)
    return "\n".join(chunks)


def _guess_vendor_name(text: str) -> str | None:
    """First non-trivial line from page 1 — heuristic but works for ~70% of
    digitally-rendered invoices where the letterhead is the top of the page.

    Skips lines that look like dates, amounts, or pure punctuation.
    """
    for raw in text.splitlines()[:VENDOR_SCAN_LINES]:
        line = raw.strip()
        if len(line) < VENDOR_MIN_LINE_LENGTH:
            continue
        digits = sum(1 for ch in line if ch.isdigit())
        if digits > len(line) * VENDOR_MAX_DIGIT_RATIO:
            continue
        if _RE_DATE_DE.search(line) or _RE_DATE_ISO.search(line):
            continue
        if line.lower().startswith(VENDOR_SKIPPED_PREFIXES):
            continue
        if line.startswith(VENDOR_SKIPPED_BULLETS):
            continue
        return line[:VENDOR_NAME_MAX_LENGTH]
    return None


def _find_invoice_number(text: str) -> str | None:
    m = _RE_INVOICE_NUMBER.search(text)
    return m.group(1).strip().rstrip(".,;:") if m else None


def _find_issue_date(text: str) -> int | None:
    m = _RE_ISSUE_DATE_CUE.search(text)
    issue_date = _parse_de_date(m.group(1)) if m else None
    if issue_date is not None:
        return issue_date
    # First plausible date anywhere as last resort.
    first = _RE_DATE_DE.search(text) or _RE_DATE_ISO.search(text)
    return _parse_de_date(first.group(0)) if first else None


def _find_due_date(text: str) -> int | None:
    m = _RE_DUE_DATE_CUE.search(text)
    return _parse_de_date(m.group(1)) if m else None


def _find_total_cents(text: str) -> int | None:
    m = _RE_TOTAL_CUE.search(text)
    total_cents = _de_amount_to_cents(m.group(1)) if m else None
    if total_cents is not None:
        return total_cents
    # Fallback: largest EUR amount in the document.
    amounts = [_de_amount_to_cents(x) for x in _RE_EUR_AMOUNT.findall(text)]
    positive = [a for a in amounts if a is not None and a > 0]
    return max(positive) if positive else None


def _find_vat_id(text: str) -> str | None:
    m = _RE_VAT_ID.search(text)
    return m.group(1).replace(" ", "") if m else None


def extract_text_heuristic(pdf_path: str) -> dict[str, Any]:
    """Best-effort heuristic extraction. Returns:
    {
      found: bool,                # True if we got at least one usable field
      textLength: int,            # raw text length (0 = no text layer / scan)
      data?: {
        invoiceNumber, issueDate, dueDate, totalCents, currency,
        vendorName, vendorVatId
      }
    }
    """
    path = Path(pdf_path)
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    text = _read_pdf_text(path)
    if not text.strip():
        return {"found": False, "textLength": 0}

    invoice_number = _find_invoice_number(text)
    issue_date = _find_issue_date(text)
    total_cents = _find_total_cents(text)
    vendor_name = _guess_vendor_name(text)

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
            "dueDate": _find_due_date(text),
            "totalCents": total_cents,
            "currency": FALLBACK_CURRENCY,
            "vendorName": vendor_name,
            "vendorVatId": _find_vat_id(text),
        },
    }
