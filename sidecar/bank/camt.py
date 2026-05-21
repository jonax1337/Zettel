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

import re
from decimal import Decimal
from typing import Any
from xml.etree import ElementTree as ET


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
    if elem is None or elem.text is None:
        return 0
    s = elem.text.strip()
    if not s:
        return 0
    try:
        # CAMT amounts use '.' as decimal separator always (ISO 20022).
        return int((Decimal(s) * 100).to_integral_value())
    except Exception:
        return 0


def _entry_to_booking(entry: ET.Element) -> dict[str, Any]:
    amount_el = _find_direct(entry, "Amt")
    amount = _amount_cents(amount_el)
    currency = ""
    if amount_el is not None:
        currency = amount_el.attrib.get("Ccy", "")

    # CdtDbtInd: CRDT = Geldeingang (positiv), DBIT = Geldausgang (negativ).
    cdtdbt = _text(_find_direct(entry, "CdtDbtInd"))
    if cdtdbt == "DBIT":
        amount = -amount

    # Valuta-Datum (Wertstellung) — sonst Buchungstag.
    val_dt = _find(_find_direct(entry, "ValDt"), "Dt") or _find(
        _find_direct(entry, "ValDt"), "DtTm"
    )
    book_dt = _find(_find_direct(entry, "BookgDt"), "Dt") or _find(
        _find_direct(entry, "BookgDt"), "DtTm"
    )
    date_str = _text(val_dt) or _text(book_dt) or ""
    # CAMT dates are ISO-8601: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
    if date_str:
        date_str = date_str[:10]

    # Transaction-Details (Verwendungszweck, Partner).
    purpose_parts: list[str] = []
    for ustrd in _findall(entry, "Ustrd"):
        purpose_parts.append(_text(ustrd))
    purpose = " ".join(p for p in purpose_parts if p).strip()

    # Partner name — different paths depending on credit/debit direction:
    # Kreditor (incoming) = RltdPties/Cdtr/Nm; Debitor (outgoing) = Dbtr/Nm.
    # Wir nehmen das jeweils "andere" Konto, d. h. den Kontrahenten.
    partner = ""
    for path_name in ("Dbtr", "Cdtr"):
        node = _find(entry, path_name)
        if node is not None:
            nm = _find(node, "Nm")
            if nm is not None and _text(nm):
                partner = _text(nm)
                break

    tx_id = _text(_find(entry, "AcctSvcrRef")) or _text(_find(entry, "EndToEndId"))

    return {
        "valutaDate": date_str,
        "amountCent": amount,
        "currency": currency,
        "partyName": partner,
        "purpose": purpose,
        "transactionId": tx_id,
    }


def parse_camt053(content: str) -> list[dict[str, Any]]:
    """Parse a CAMT.053 file. Returns list of booking dicts."""
    root = ET.fromstring(content)
    entries = [c for c in root.iter() if _strip_ns(c.tag) == "Ntry"]
    return [_entry_to_booking(e) for e in entries]


def detect_format(content: str) -> str:
    """Return 'camt' if the content looks like CAMT.053 XML, else 'mt940'."""
    head = content.lstrip()[:512]
    if head.startswith("<?xml") or "<Document" in head or "camt.053" in head.lower():
        return "camt"
    # MT940 uses `:20:` tag near the top.
    if re.search(r":20:", head):
        return "mt940"
    # Fallback — try XML first.
    return "camt" if "<" in head[:50] else "mt940"
