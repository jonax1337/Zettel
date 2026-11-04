"""Render an invoice payload to PDF/A-3 with embedded Factur-X XML."""
from __future__ import annotations

import base64
import io
import mimetypes
from pathlib import Path
from typing import Any

from weasyprint import CSS, HTML

from .templates import build_env, templates_dir
from .vat import open_balance_cent, signed_paid_cent, vat_groups
from .zugferd import render_zugferd_xml, resolve_profile
from .qr import build_epc_payload, epc_qr_svg_data_uri, should_emit_qr

DEFAULT_PDF_THEME = "classic"
STYLESHEET_FILENAME = "invoice.css"
DEFAULT_MIME_TYPE = "image/png"


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
    iban = (company.get("bankIban") or "").strip()
    currency = invoice.get("currency") or "EUR"
    amount_cent = open_balance_cent(invoice)
    if not should_emit_qr(
        currency=currency,
        iban=iban,
        amount_cent=amount_cent,
        is_credit_note=bool(invoice.get("isCreditNote")),
    ):
        return None
    name = company.get("companyName") or company.get("ownerName") or ""
    remittance = f"Rechnung {invoice.get('number', '')}".strip()
    payload = build_epc_payload(
        beneficiary_name=name,
        iban=iban,
        amount_cent=amount_cent,
        bic=company.get("bankBic"),
        remittance=remittance,
    )
    return epc_qr_svg_data_uri(payload)


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
    return _render_html(
        "offer.html.j2",
        payload,
        offer=payload["offer"],
        items=payload["items"],
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
    return _write_output(payload, _html_to_pdf(render_reminder_html(payload)))


def render_offer_pdf(payload: dict[str, Any]) -> Path:
    """Render an offer (Angebot) to PDF/A-3b — no ZUGFeRD XML embedded."""
    return _write_output(payload, _html_to_pdf(render_offer_html(payload)))


def render_invoice_pdf(payload: dict[str, Any]) -> Path:
    """Render an invoice to PDF/A-3 with the ZUGFeRD XML embedded.

    payload schema — see sidecar/README.md for the full list of fields.
    """
    pdf_bytes = _html_to_pdf(render_invoice_html(payload))
    xml_str = render_zugferd_xml(payload)
    final_pdf = _embed_xml(pdf_bytes, xml_str, resolve_profile(payload))
    return _write_output(payload, final_pdf)
