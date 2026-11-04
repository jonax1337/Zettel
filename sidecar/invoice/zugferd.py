"""Render an EN 16931 / Factur-X (Comfort) XML for an invoice payload."""
from __future__ import annotations

import math
from typing import Any

from .templates import build_env, format_unix_utc


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


CII_DATE_FORMAT = "%Y%m%d"
DEFAULT_UNIT_CODE = "C62"


def _date_xml(unix_seconds: int | None) -> str:
    return format_unix_utc(unix_seconds, CII_DATE_FORMAT)


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
        return DEFAULT_UNIT_CODE
    return UNECE_UNITS.get(unit.strip(), DEFAULT_UNIT_CODE)


def _line_tax_cent(line_total_cent: int, rate_percent: float) -> int:
    """Per-line VAT rounded like the app's Math.round (half up, not banker's),
    so the group sums reconcile with the invoice's TaxTotalAmount."""
    return math.floor(line_total_cent * rate_percent / 100 + 0.5)


def _vat_groups(items: list[dict[str, Any]], is_klein: bool, sign: int = 1) -> list[dict[str, Any]]:
    """Sum line totals and tax per rate group, sorted by rate asc.

    Tax is rounded on the unsigned line total and signed afterwards, matching
    how the app derives a credit note's VAT from the positive invoice.
    """
    groups: dict[float, dict[str, Any]] = {}
    for it in items:
        rate = 0 if is_klein else float(it.get("vatRate") or 0)
        line = int(it.get("lineTotal") or 0)
        tax = 0 if is_klein else _line_tax_cent(line, rate)
        group = groups.setdefault(rate, {"rate": rate, "basis": 0, "tax": 0})
        group["basis"] += line * sign
        group["tax"] += tax * sign
    if not groups:
        groups[0] = {"rate": 0, "basis": 0, "tax": 0}
    return sorted(groups.values(), key=lambda g: g["rate"])


DEFAULT_PROFILE = "en16931"

_PROFILE_URNS = {
    "basic": "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic",
    "en16931": "urn:cen.eu:en16931:2017",
    "extended": "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended",
}


def resolve_profile(payload: dict[str, Any]) -> str:
    """Requested Factur-X profile, falling back to EN 16931 for unknown names."""
    profile = (payload.get("profile") or DEFAULT_PROFILE).lower()
    return profile if profile in _PROFILE_URNS else DEFAULT_PROFILE


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

    return template.render(
        invoice=invoice,
        items=items,
        company=company,
        customer=customer,
        vat_groups=_vat_groups(items, is_klein, sign),
        guideline_urn=_PROFILE_URNS[resolve_profile(payload)],
    )
