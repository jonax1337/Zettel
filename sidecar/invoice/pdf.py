"""Render an invoice payload to PDF/A-3 with embedded Factur-X XML."""
from __future__ import annotations

import base64
import io
import mimetypes
from collections.abc import Callable
from pathlib import Path
from typing import Any

from weasyprint import CSS, HTML

from .document_view import invoice_view, offer_view, reminder_view
from .templates import build_env, templates_dir
from .typst_pdf import render_typst_pdf
from .vat import open_balance_cent, signed_paid_cent, vat_groups
from .zugferd import render_zugferd_xml, resolve_profile
from .qr import epc_qr_svg_data_uri, invoice_epc_payload

DEFAULT_PDF_THEME = "classic"
STYLESHEET_FILENAME = "invoice.css"
DEFAULT_MIME_TYPE = "image/png"
RENDERER_WEASYPRINT = "weasyprint"
RENDERER_TYPST = "typst"


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
        mime = DEFAULT_MIME_TYPE
    encoded = base64.b64encode(p.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _maybe_epc_qr(invoice: dict[str, Any], company: dict[str, Any]) -> str | None:
    """Build the EPC-QR data URI if the invoice qualifies, else None."""
    payload = invoice_epc_payload(invoice, company)
    return epc_qr_svg_data_uri(payload) if payload else None


def _render_html(template_name: str, payload: dict[str, Any], **context: Any) -> str:
    template = build_env().get_template(template_name)
    company = dict(payload["company"])
    company["logoDataUri"] = _logo_data_uri(company.get("logoPath"))
    settings = payload.get("settings") or {"pdf_theme": DEFAULT_PDF_THEME}
    return template.render(
        company=company,
        customer=payload["customer"],
        settings=settings,
        **context,
    )


def _html_to_pdf(html_str: str) -> bytes:
    """Render HTML with WeasyPrint as PDF/A-3b.

    PDF/A-3b is the variant required for ZUGFeRD/Factur-X attachments; for
    offers and reminders it keeps the file long-term archivable (WeasyPrint
    emits the XMP packet and sRGB OutputIntent and embeds all fonts).
    """
    css_path = templates_dir() / STYLESHEET_FILENAME
    buf = io.BytesIO()
    HTML(string=html_str, base_url=str(css_path.parent)).write_pdf(
        target=buf,
        stylesheets=[CSS(filename=str(css_path))],
        pdf_variant="pdf/a-3b",
    )
    return buf.getvalue()


def _render_pdf(
    payload: dict[str, Any],
    html_of: Callable[[dict[str, Any]], str],
    view_of: Callable[[dict[str, Any]], dict[str, Any]],
) -> bytes:
    """PDF/A-3b of the document, set by the engine chosen in the settings."""
    renderer = (payload.get("settings") or {}).get("pdf_renderer") or RENDERER_WEASYPRINT
    if renderer == RENDERER_TYPST:
        return render_typst_pdf(view_of(payload), payload["company"].get("logoPath"))
    if renderer == RENDERER_WEASYPRINT:
        return _html_to_pdf(html_of(payload))
    raise ValueError(f"Unbekannte PDF-Engine: {renderer}")


def _embed_xml(pdf_bytes: bytes, xml_str: str, profile: str) -> bytes:
    """Embed Factur-X XML into a PDF/A-3 using the factur-x library."""
    from facturx import generate_from_binary

    return generate_from_binary(
        pdf_bytes,
        xml_str.encode("utf-8"),
        flavor="factur-x",
        level=profile,
        check_xsd=False,
        # Schematron runs via HTTP against a Saxon server; validation is KoSIT's job.
        check_schematron=False,
    )


def _write_output(payload: dict[str, Any], pdf_bytes: bytes) -> Path:
    output_path = Path(payload["outputPath"]).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(pdf_bytes)
    return output_path


def render_reminder_html(payload: dict[str, Any]) -> str:
    return _render_html(
        "reminder.html.j2",
        payload,
        reminder=payload["reminder"],
        invoice=payload["invoice"],
    )


def render_offer_html(payload: dict[str, Any]) -> str:
    offer = payload["offer"]
    items = payload["items"]
    return _render_html(
        "offer.html.j2",
        payload,
        offer=offer,
        items=items,
        vat_groups=vat_groups(items, bool(offer.get("isKleinunternehmer"))),
    )


def render_invoice_html(payload: dict[str, Any]) -> str:
    invoice = payload["invoice"]
    items = payload["items"]
    sign = -1 if invoice.get("isCreditNote") else 1
    return _render_html(
        "invoice.html.j2",
        payload,
        invoice=invoice,
        items=items,
        vat_groups=vat_groups(items, bool(invoice.get("isKleinunternehmer")), sign),
        paid_cent=signed_paid_cent(invoice),
        open_cent=open_balance_cent(invoice),
        epc_qr_uri=_maybe_epc_qr(invoice, payload["company"]),
    )


def render_reminder_pdf(payload: dict[str, Any]) -> Path:
    """Render a payment reminder (Zahlungserinnerung/Mahnung) to PDF/A-3b.

    No embedded ZUGFeRD XML — reminders aren't e-invoices per EN16931.
    """
    return _write_output(payload, _render_pdf(payload, render_reminder_html, reminder_view))


def render_offer_pdf(payload: dict[str, Any]) -> Path:
    """Render an offer (Angebot) to PDF/A-3b — no ZUGFeRD XML embedded."""
    return _write_output(payload, _render_pdf(payload, render_offer_html, offer_view))


def render_invoice_pdf(payload: dict[str, Any]) -> Path:
    """Render an invoice to PDF/A-3 with the ZUGFeRD XML embedded.

    payload schema — see sidecar/README.md for the full list of fields.
    """
    pdf_bytes = _render_pdf(payload, render_invoice_html, invoice_view)
    xml_str = render_zugferd_xml(payload)
    final_pdf = _embed_xml(pdf_bytes, xml_str, resolve_profile(payload))
    return _write_output(payload, final_pdf)
