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


def _vat_groups(items: list[dict[str, Any]], is_klein: bool, sign: int = 1) -> list[dict[str, Any]]:
    """Sum line totals and tax per (rate, category) group, sorted by rate asc."""
    groups: "OrderedDict[float, dict[str, Any]]" = OrderedDict()
    for it in items:
        rate = 0 if is_klein else float(it.get("vatRate") or 0)
        line = int(it.get("lineTotal") or 0) * sign
        tax = 0 if is_klein else round(line * rate / 100)
        if rate not in groups:
            groups[rate] = {"rate": rate, "basis": 0, "tax": 0}
        groups[rate]["basis"] += line
        groups[rate]["tax"] += tax
    if not groups:
        groups[0] = {"rate": 0, "basis": 0, "tax": 0}
    return sorted(groups.values(), key=lambda g: g["rate"])


_PROFILE_URNS = {
    "basic": "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic",
    "en16931": "urn:cen.eu:en16931:2017",
    "extended": "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended",
}


def render_zugferd_xml(payload: dict[str, Any]) -> str:
    """Render the ZUGFeRD XML for embedding in PDF/A-3.

    Profile selection only swaps the ``GuidelineSpecifiedDocumentContextParameter``
    URN — the actual field set written stays the same. BASIC is a strict subset
    of EN 16931, so emitting EN 16931's mandatory fields is valid for BASIC too.
    EXTENDED is a superset; the optional EXTENDED-only fields (delivery address,
    project ID, …) are currently not modeled in Zettel and can be added later
    without changing the URN selection.
    """
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
    sign = -1 if invoice.get("isCreditNote") else 1
    profile = (payload.get("profile") or "en16931").lower()
    guideline_urn = _PROFILE_URNS.get(profile, _PROFILE_URNS["en16931"])

    return template.render(
        invoice=invoice,
        items=items,
        company=company,
        customer=customer,
        vat_groups=_vat_groups(items, is_klein, sign),
        guideline_urn=guideline_urn,
    )
