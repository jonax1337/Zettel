"""Render an invoice payload to PDF/A-3 with embedded Factur-X XML."""
from __future__ import annotations

import base64
import io
import mimetypes
from pathlib import Path
from typing import Any

from weasyprint import CSS, HTML

from .templates import build_env
from .zugferd import render_zugferd_xml

# Factur-X levels accepted by the factur-x library. We surface them under our
# own profile names so the UI can present "BASIC / EN 16931 / EXTENDED" labels.
_PROFILE_TO_LEVEL = {
    "basic": "basic",
    "en16931": "en16931",
    "extended": "extended",
}


def _logo_data_uri(logo_path: str | None) -> str | None:
    """Convert an on-disk logo into an inline data: URI.

    WeasyPrint resolves <img src> against base_url, but users pick logos from
    arbitrary paths (Pictures, OneDrive, network shares). Inlining sidesteps
    file-access surprises and means the rendered HTML is fully self-contained.
    """
    if not logo_path:
        return None
    p = Path(logo_path).expanduser()
    if not p.is_file():
        return None
    mime, _ = mimetypes.guess_type(p.name)
    if mime is None:
        mime = "image/png"
    encoded = base64.b64encode(p.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _render_html_pdf(payload: dict[str, Any]) -> bytes:
    """Render the visible PDF using Jinja + WeasyPrint, return raw bytes."""
    env = build_env()
    template = env.get_template("invoice.html.j2")
    company = dict(payload["company"])
    company["logoDataUri"] = _logo_data_uri(company.get("logoPath"))
    settings = payload.get("settings") or {"pdf_theme": "classic"}
    html_str = template.render(
        invoice=payload["invoice"],
        items=payload["items"],
        company=company,
        customer=payload["customer"],
        settings=settings,
    )
    css_path = Path(template.environment.loader.searchpath[0]) / "invoice.css"
    stylesheets = [CSS(filename=str(css_path))] if css_path.exists() else []

    buf = io.BytesIO()
    HTML(string=html_str, base_url=str(css_path.parent)).write_pdf(
        target=buf,
        stylesheets=stylesheets,
        # PDF/A-3b is the variant required for ZUGFeRD/Factur-X attachments.
        pdf_variant="pdf/a-3b",
    )
    return buf.getvalue()


def _embed_xml(pdf_bytes: bytes, xml_str: str, profile: str) -> bytes:
    """Embed Factur-X XML into a PDF/A-3 using the factur-x library."""
    from facturx import generate_from_binary

    level = _PROFILE_TO_LEVEL.get(profile, "en16931")
    result = generate_from_binary(
        pdf_bytes,
        xml_str.encode("utf-8"),
        flavor="factur-x",
        level=level,
        check_xsd=False,
    )
    return result


def _render_offer_html_pdf(payload: dict[str, Any]) -> bytes:
    """Render the offer PDF as PDF/A-3b (archival), without ZUGFeRD XML."""
    env = build_env()
    template = env.get_template("offer.html.j2")
    company = dict(payload["company"])
    company["logoDataUri"] = _logo_data_uri(company.get("logoPath"))
    settings = payload.get("settings") or {"pdf_theme": "classic"}
    html_str = template.render(
        offer=payload["offer"],
        items=payload["items"],
        company=company,
        customer=payload["customer"],
        settings=settings,
    )
    css_path = Path(template.environment.loader.searchpath[0]) / "invoice.css"
    stylesheets = [CSS(filename=str(css_path))] if css_path.exists() else []

    buf = io.BytesIO()
    # PDF/A-3b: WeasyPrint emits the required XMP packet, sRGB OutputIntent and
    # ensures all fonts are embedded. Offers aren't e-invoices, so we skip the
    # factur-x XML attachment step — the file is still long-term archivable.
    HTML(string=html_str, base_url=str(css_path.parent)).write_pdf(
        target=buf,
        stylesheets=stylesheets,
        pdf_variant="pdf/a-3b",
    )
    return buf.getvalue()


def render_offer_pdf(payload: dict[str, Any]) -> Path:
    """
    Render an offer (Angebot) to a PDF/A-3b — no ZUGFeRD XML embedded.

    Returns: Path to the generated PDF/A-3 file.
    """
    output_path = Path(payload["outputPath"]).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_bytes = _render_offer_html_pdf(payload)
    output_path.write_bytes(pdf_bytes)
    return output_path


def render_invoice_pdf(payload: dict[str, Any]) -> Path:
    """
    payload schema — see sidecar/README.md for the full list of fields.

    Returns: Path to the generated PDF/A-3 file with embedded ZUGFeRD XML.
    """
    output_path = Path(payload["outputPath"]).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    profile = (payload.get("profile") or "en16931").lower()
    pdf_bytes = _render_html_pdf(payload)
    xml_str = render_zugferd_xml(payload)
    final_pdf = _embed_xml(pdf_bytes, xml_str, profile)

    output_path.write_bytes(final_pdf)
    return output_path
