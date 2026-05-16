"""Render an EN 16931 / Factur-X (Comfort) XML for an invoice payload."""
from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

from .templates import build_env


# UN/ECE Recommendation 20 unit codes — only the few we use in the UI.
UNECE_UNITS = {
    "h": "HUR",
    "Std": "HUR",
    "Stunde": "HUR",
    "Stunden": "HUR",
    "Stk": "C62",
    "Stück": "C62",
    "Tag": "DAY",
    "Tage": "DAY",
    "Pauschal": "C62",
    "kg": "KGM",
    "m": "MTR",
    "km": "KMT",
    "l": "LTR",
}


def _date_xml(unix_seconds: int | None) -> str:
    if not unix_seconds:
        return ""
    dt = datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc)
    return dt.strftime("%Y%m%d")


def _cents_xml(cents: int | float | None) -> str:
    if cents is None:
        return "0.00"
    return f"{(float(cents) / 100):.2f}"


def _qty_xml(q: float | int | None) -> str:
    if q is None:
        return "0"
    return f"{float(q):.4f}".rstrip("0").rstrip(".") or "0"


def _unece_unit(unit: str | None) -> str:
    if not unit:
        return "C62"
    return UNECE_UNITS.get(unit.strip(), "C62")


def _vat_groups(items: list[dict[str, Any]], is_klein: bool) -> list[dict[str, Any]]:
    """Sum line totals and tax per (rate, category) group, sorted by rate asc."""
    groups: "OrderedDict[float, dict[str, Any]]" = OrderedDict()
    for it in items:
        rate = 0 if is_klein else float(it.get("vatRate") or 0)
        line = int(it.get("lineTotal") or 0)
        tax = 0 if is_klein else round(line * rate / 100)
        if rate not in groups:
            groups[rate] = {"rate": rate, "basis": 0, "tax": 0}
        groups[rate]["basis"] += line
        groups[rate]["tax"] += tax
    if not groups:
        groups[0] = {"rate": 0, "basis": 0, "tax": 0}
    return sorted(groups.values(), key=lambda g: g["rate"])


def render_zugferd_xml(payload: dict[str, Any]) -> str:
    """Render the EN 16931 XML string for embedding in PDF/A-3."""
    env = build_env()
    env.filters["date_xml"] = _date_xml
    env.filters["cents_xml"] = _cents_xml
    env.filters["qty_xml"] = _qty_xml
    env.filters["unece_unit"] = _unece_unit

    template = env.get_template("zugferd-en16931.xml.j2")
    invoice = payload["invoice"]
    items = payload["items"]
    company = payload["company"]
    customer = payload["customer"]
    is_klein = bool(invoice.get("isKleinunternehmer"))

    return template.render(
        invoice=invoice,
        items=items,
        company=company,
        customer=customer,
        vat_groups=_vat_groups(items, is_klein),
    )
