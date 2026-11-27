"""Render an invoice payload to PDF/A-3 with embedded Factur-X XML."""
from __future__ import annotations

import base64
import io
import mimetypes
from collections.abc import Callable
from functools import partial
from pathlib import Path
from typing import Any
from urllib.parse import quote


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
PDF_A_VARIANT = "pdf/a-3b"
# Shown on every page of a preview of a document that is not issued yet.
DRAFT_WATERMARK = "ENTWURF"
# The A4 sheet in millimetres: the watermark's SVG shares the page's coordinates.
PAGE_WIDTH_MM = 210
PAGE_HEIGHT_MM = 297
WATERMARK_FONT_SIZE_MM = 35
WATERMARK_ANGLE_DEG = -35
# Puts the baseline half a cap height below the sheet's centre, so the text itself is centred.
WATERMARK_BASELINE_OFFSET_MM = 12
WATERMARK_FILL = "rgb(200,40,40)"
WATERMARK_OPACITY = 0.18
# A page background is placed against the page's content area, whose corner moves with the
# page margins of invoice.css (25 mm left; 98.5 mm on the first page, 32 mm below): the image
# starts at the sheet corner when it is shifted back by exactly these.
PAGE_MARGIN_LEFT_MM = 25
FIRST_PAGE_MARGIN_TOP_MM = 98.5
FOLLOWING_PAGE_MARGIN_TOP_MM = 32


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


def _html_to_pdf(
    html_str: str,
    *,
    pdf_variant: str | None = PDF_A_VARIANT,
    extra_css: tuple[str, ...] = (),
) -> bytes:
    """Render HTML with WeasyPrint, by default as PDF/A-3b.

    PDF/A-3b is the variant required for ZUGFeRD/Factur-X attachments; for
    offers and reminders it keeps the file long-term archivable (WeasyPrint
    emits the XMP packet and sRGB OutputIntent and embeds all fonts).
    """
    # Imported here: it takes over a second, which the HTML preview path never needs.
    from weasyprint import CSS, HTML

    css_dir = templates_dir()
    buf = io.BytesIO()
    HTML(string=html_str, base_url=str(css_dir)).write_pdf(
        target=buf,
        stylesheets=[CSS(filename=str(css_dir / STYLESHEET_FILENAME)), *(CSS(string=css) for css in extra_css)],
        pdf_variant=pdf_variant,
    )
    return buf.getvalue()


def _renderer_of(payload: dict[str, Any]) -> str:
    renderer = (payload.get("settings") or {}).get("pdf_renderer") or RENDERER_WEASYPRINT
    if renderer not in (RENDERER_WEASYPRINT, RENDERER_TYPST):
        raise ValueError(f"Unbekannte PDF-Engine: {renderer}")
    return renderer


def _render_pdf(
    payload: dict[str, Any],
    html_of: Callable[[dict[str, Any]], str],
    view_of: Callable[[dict[str, Any]], dict[str, Any]],
) -> bytes:
    """PDF/A-3b of the document, set by the engine chosen in the settings."""
    if _renderer_of(payload) == RENDERER_TYPST:
        return render_typst_pdf(view_of(payload), payload["company"].get("logoPath"))
    return _html_to_pdf(html_of(payload))


def _watermark_css() -> str:
    """A page background that paints the watermark on every page, centred on the sheet.

    It takes no room, so page breaks stay those of the issued PDF, and it does not live in
    the HTML, which therefore cannot come out unmarked. The image is as large as the sheet.
    """
    centre_x, centre_y = PAGE_WIDTH_MM / 2, PAGE_HEIGHT_MM / 2
    svg = (
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{PAGE_WIDTH_MM}mm' height='{PAGE_HEIGHT_MM}mm' "
        f"viewBox='0 0 {PAGE_WIDTH_MM} {PAGE_HEIGHT_MM}'>"
        f"<text x='{centre_x}' y='{centre_y + WATERMARK_BASELINE_OFFSET_MM}' text-anchor='middle' "
        f"font-family='Helvetica, Arial, sans-serif' font-weight='700' font-size='{WATERMARK_FONT_SIZE_MM}' "
        f"fill='{WATERMARK_FILL}' fill-opacity='{WATERMARK_OPACITY}' "
        f"transform='rotate({WATERMARK_ANGLE_DEG} {centre_x} {centre_y})'>{DRAFT_WATERMARK}</text></svg>"
    )
    uri = "data:image/svg+xml;utf8," + quote(svg, safe="/:=,;'()- .")
    size = f"{PAGE_WIDTH_MM}mm {PAGE_HEIGHT_MM}mm"
    return (
        f'@page {{ background: url("{uri}") -{PAGE_MARGIN_LEFT_MM}mm -{FOLLOWING_PAGE_MARGIN_TOP_MM}mm / {size} no-repeat; }}\n'
        f"@page :first {{ background-position: -{PAGE_MARGIN_LEFT_MM}mm -{FIRST_PAGE_MARGIN_TOP_MM}mm; }}"
    )


def _render_preview_pdf(
    payload: dict[str, Any],
    html_of: Callable[[dict[str, Any]], str],
    view_of: Callable[[dict[str, Any]], dict[str, Any]],
) -> bytes:
    """Draft PDF in the engine chosen in the settings, set like the issued one but watermarked.

    It claims no PDF/A: a watermarked draft is not an archival document.
    """
    if _renderer_of(payload) == RENDERER_TYPST:
        view = {**view_of(payload), "watermark": DRAFT_WATERMARK}
        return render_typst_pdf(view, payload["company"].get("logoPath"), pdf_standards=())
    return _html_to_pdf(html_of(payload), pdf_variant=None, extra_css=(_watermark_css(),))


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


def render_invoice_html(payload: dict[str, Any], *, payment_qr: bool = True) -> str:
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
        epc_qr_uri=_maybe_epc_qr(invoice, payload["company"]) if payment_qr else None,
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


# A draft has no number to pay against, so its preview carries no payment QR code: a banking
# app would turn it into a real transfer.
_PREVIEW_DOCUMENTS = {
    "invoice": (partial(render_invoice_html, payment_qr=False), partial(invoice_view, payment_qr=False)),
    "offer": (render_offer_html, offer_view),
}
PREVIEW_KINDS = tuple(_PREVIEW_DOCUMENTS)


def render_preview_pdf(kind: str, payload: dict[str, Any]) -> Path:
    """Render an invoice or offer as a watermarked draft PDF for looking at and printing.

    It uses the same templates and engine as the issued PDF, but marks every page
    as a draft, embeds no ZUGFeRD XML and writes only to `payload["outputPath"]`.
    """
    html_of, view_of = _PREVIEW_DOCUMENTS[kind]
    return _write_output(payload, _render_preview_pdf(payload, html_of, view_of))
