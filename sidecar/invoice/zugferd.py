"""Render the EN 16931 CII XML for an invoice payload: Factur-X (embedded in the PDF) or XRechnung (standalone)."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .templates import build_env, format_unix_local
from .vat import open_balance_cent, signed_paid_cent, vat_groups


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
    return format_unix_local(unix_seconds, CII_DATE_FORMAT)


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


BASIC_PROFILE = "basic"
DEFAULT_PROFILE = "en16931"
EXTENDED_PROFILE = "extended"

_PROFILE_URNS = {
    BASIC_PROFILE: "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic",
    DEFAULT_PROFILE: "urn:cen.eu:en16931:2017",
    EXTENDED_PROFILE: "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended",
}


XRECHNUNG_GUIDELINE_URN = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0"
# BT-23: the Peppol BIS billing process, which XRechnung 3.0 requires as business process.
XRECHNUNG_BUSINESS_PROCESS = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"


def resolve_profile(payload: dict[str, Any]) -> str:
    """Requested Factur-X profile, falling back to EN 16931 for unknown names."""
    profile = (payload.get("profile") or DEFAULT_PROFILE).lower()
    return profile if profile in _PROFILE_URNS else DEFAULT_PROFILE


def _render_cii(payload: dict[str, Any], guideline_urn: str, *, xrechnung: bool, profile: str) -> str:
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
        vat_groups=vat_groups(items, is_klein, sign),
        prepaid_cent=signed_paid_cent(invoice),
        due_cent=open_balance_cent(invoice),
        guideline_urn=guideline_urn,
        xrechnung=xrechnung,
        xrechnung_business_process=XRECHNUNG_BUSINESS_PROCESS,
        basic_profile=profile == BASIC_PROFILE,
        # Structured discount terms exist in the EXTENDED schema only; the
        # other profiles carry the discount as a "#SKONTO#" description line.
        structured_skonto=profile == EXTENDED_PROFILE,
    )


def render_zugferd_xml(payload: dict[str, Any]) -> str:
    """Render the ZUGFeRD XML for embedding in PDF/A-3.

    All profiles share one template and field set, minus what a profile's
    schema does not define: BASIC has no item description (BT-154) and no BIC
    (BT-86), and only EXTENDED has structured discount terms. EXTENDED-only
    fields (delivery address, project ID, …) are not modeled in Zettel.
    """
    profile = resolve_profile(payload)
    return _render_cii(payload, _PROFILE_URNS[profile], xrechnung=False, profile=profile)


def render_xrechnung_xml(payload: dict[str, Any]) -> str:
    """Render the standalone XRechnung 3.0 CII XML for public authorities.

    The caller guarantees the BR-DE mandatory fields (buyer reference, seller
    contact, payment means); the KoSIT validator rejects a file without them.
    """
    return _render_cii(payload, XRECHNUNG_GUIDELINE_URN, xrechnung=True, profile=DEFAULT_PROFILE)


def write_xrechnung_xml(payload: dict[str, Any]) -> Path:
    output_path = Path(payload["outputPath"]).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_xrechnung_xml(payload), encoding="utf-8")
    return output_path
