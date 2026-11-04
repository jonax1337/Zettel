"""CAMT.053 (ISO 20022) parser.

We only extract the minimum needed for invoice-matching:
- valuta date
- amount (in cents, signed: credit = positive, debit = negative)
- currency code
- partner name
- unstructured remittance / purpose
- transaction-ID for idempotency

The XML namespace varies (camt.053.001.02, .04, .08…). We strip namespaces
defensively rather than trying to keep up.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any
from xml.etree import ElementTree as ET

from .booking import make_booking, to_cents

DEBIT_INDICATOR = "DBIT"
ISO_DATE_LENGTH = len("YYYY-MM-DD")
FORMAT_SNIFF_LENGTH = 512
XML_PROLOG_SNIFF_LENGTH = 50


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def _findall(elem: ET.Element | None, name: str) -> list[ET.Element]:
    if elem is None:
        return []
    return [c for c in elem.iter() if _strip_ns(c.tag) == name]


def _find(elem: ET.Element | None, name: str) -> ET.Element | None:
    if elem is None:
        return None
    for c in elem.iter():
        if _strip_ns(c.tag) == name:
            return c
    return None


def _find_direct(elem: ET.Element | None, name: str) -> ET.Element | None:
    """Find direct child only — to avoid mismatches across nested entries."""
    if elem is None:
        return None
    for c in list(elem):
        if _strip_ns(c.tag) == name:
            return c
    return None


def _text(elem: ET.Element | None) -> str:
    return (elem.text or "").strip() if elem is not None else ""


def _amount_cents(elem: ET.Element | None) -> int:
    """Convert an <Amt Ccy="EUR">123.45</Amt> element to integer cents."""
    text = _text(elem)
    if not text:
        return 0
    try:
        # CAMT amounts use '.' as decimal separator always (ISO 20022).
        return to_cents(Decimal(text))
    except InvalidOperation as e:
        raise ValueError(f"Ungültiger Betrag im CAMT-Eintrag: {text!r}") from e


def _entry_date(entry: ET.Element) -> str:
    """Valuta date (Wertstellung), else booking date, as ISO YYYY-MM-DD."""
    for container in ("ValDt", "BookgDt"):
        parent = _find_direct(entry, container)
        # CAMT dates are ISO-8601: YYYY-MM-DD (Dt) or YYYY-MM-DDTHH:MM:SS (DtTm).
        date_text = _text(_find(parent, "Dt")) or _text(_find(parent, "DtTm"))
        if date_text:
            return date_text[:ISO_DATE_LENGTH]
    return ""


def _counterparty_name(entry: ET.Element, is_debit: bool) -> str:
    """Name of the other account: the creditor for outgoing, the debtor for incoming money."""
    party = _find(entry, "Cdtr" if is_debit else "Dbtr")
    return _text(_find(party, "Nm"))


def _purpose(entry: ET.Element) -> str:
    return " ".join(text for text in map(_text, _findall(entry, "Ustrd")) if text)


def _entry_to_booking(entry: ET.Element) -> dict[str, Any]:
    amount_el = _find_direct(entry, "Amt")
    # CdtDbtInd: CRDT = Geldeingang (positiv), DBIT = Geldausgang (negativ).
    is_debit = _text(_find_direct(entry, "CdtDbtInd")) == DEBIT_INDICATOR
    amount = _amount_cents(amount_el)

    return make_booking(
        valuta_date=_entry_date(entry),
        amount_cent=-amount if is_debit else amount,
        currency=amount_el.attrib.get("Ccy", "") if amount_el is not None else "",
        party_name=_counterparty_name(entry, is_debit),
        purpose=_purpose(entry),
        transaction_id=_text(_find(entry, "AcctSvcrRef")) or _text(_find(entry, "EndToEndId")),
    )


def parse_camt053(content: str) -> list[dict[str, Any]]:
    """Parse a CAMT.053 file. Returns list of booking dicts."""
    root = ET.fromstring(content)
    return [_entry_to_booking(e) for e in _findall(root, "Ntry")]


def detect_format(content: str) -> str:
    """Return 'camt' if the content looks like CAMT.053 XML, else 'mt940'."""
    head = content.lstrip()[:FORMAT_SNIFF_LENGTH]
    if head.startswith("<?xml") or "<Document" in head or "camt.053" in head.lower():
        return "camt"
    # MT940 uses `:20:` tag near the top.
    if ":20:" in head:
        return "mt940"
    # Fallback — try XML first.
    return "camt" if "<" in head[:XML_PROLOG_SNIFF_LENGTH] else "mt940"
