"""The draft preview PDF: the issued document's templates and engine, marked as a
draft on every page, carrying no e-invoice XML and no archival claim. The
issued PDF paths must stay as they were."""
from __future__ import annotations

import copy
import math
from pathlib import Path

import pytest
from pypdf import PdfReader
from pypdf.generic import ContentStream

import main
from invoice.extract import extract_xml_only
from invoice.html_preview import render_document_html
from invoice.pdf import (
    DRAFT_WATERMARK,
    WATERMARK_BASELINE_OFFSET_MM,
    render_invoice_pdf,
    render_offer_pdf,
    render_preview_pdf,
)

from .document_payloads import offer_payload

ENGINES = ["weasyprint", "typst"]
THEMES = ["classic", "modern", "minimal"]
LONG_DOCUMENT_ITEMS = 40  # fills a bit more than two pages
PDF_A_MARKER = b"pdfaid"  # the PDF/A identification schema of the XMP metadata
PAYMENT_QR_CAPTION = "QR-Code scannen"
PT_PER_MM = 72 / 25.4
PX_PER_MM = 96 / 25.4
SHEET_CENTRE_MM = (105, 148.5)
CENTRE_TOLERANCE_MM = 8  # Typst's origin is the text start: its centre is derived from font metrics


def _long(items: list[dict]) -> list[dict]:
    return [{**copy.deepcopy(items[i % len(items)]), "position": i + 1} for i in range(LONG_DOCUMENT_ITEMS)]


def _invoice(payloads, engine: str, out: Path, theme: str = "classic") -> dict:
    payload = payloads("03-five-positions.json")
    payload["items"] = _long(payload["items"])
    return {**payload, "settings": {"pdf_theme": theme, "pdf_renderer": engine}, "outputPath": str(out)}


def _offer(payloads, engine: str, out: Path, theme: str = "classic") -> dict:
    payload = offer_payload(payloads("03-five-positions.json"))
    payload["items"] = _long(payload["items"])
    return {**payload, "settings": {"pdf_theme": theme, "pdf_renderer": engine}, "outputPath": str(out)}


DOCUMENTS = {
    "invoice": (_invoice, render_invoice_pdf),
    "offer": (_offer, render_offer_pdf),
}


def _page_texts(pdf: Path) -> list[str]:
    return [page.extract_text() for page in PdfReader(pdf).pages]


def _xmp_metadata(pdf: Path) -> bytes:
    metadata = PdfReader(pdf).trailer["/Root"].get("/Metadata")
    return metadata.get_object().get_data() if metadata else b""


def _watermark_centre_mm(pdf: Path, page_index: int, engine: str) -> tuple[float, float]:
    """Where the page's "ENTWURF" is centred, in millimetres from the sheet's top-left corner."""
    reader = PdfReader(pdf)
    page = reader.pages[page_index]
    mark: dict = {}

    def visit(text, cm, tm, _font, _size):
        if DRAFT_WATERMARK in text:
            mark.update(cm=cm, tm=tm)

    page.extract_text(visitor_text=visit)
    cm, tm = mark["cm"], mark["tm"]
    if engine == "typst":
        # The page-space origin of the text run; the run extends 500 pt (Helvetica Bold, 100 pt)
        # along the rotation and its centre sits half a cap height above the baseline.
        angle = math.atan2(cm[1], cm[0])
        along, up = 500 / 2, 36
        x = cm[4] + along * math.cos(angle) - up * math.sin(angle)
        y = cm[5] + along * math.sin(angle) + up * math.cos(angle)
        return x / PT_PER_MM, (page.mediabox.height - y) / PT_PER_MM
    # WeasyPrint paints the mark as an SVG background: the form is placed on the page by its first
    # cm (in CSS px) and the text sits at tm in the SVG's millimetres, anchored in the middle of
    # a baseline that lies half the cap height below the centre of the rotation.
    background = next(args[0] for args, op in ContentStream(page.get_contents(), reader).operations if op == b"Do")
    form = page["/Resources"]["/XObject"][background].get_object()
    offset_px = next(args for args, op in ContentStream(form, reader).operations if op == b"cm")
    anchor = (float(offset_px[4]) / PX_PER_MM + tm[4], float(offset_px[5]) / PX_PER_MM + tm[5])
    return anchor[0], anchor[1] - WATERMARK_BASELINE_OFFSET_MM


@pytest.fixture(params=ENGINES)
def engine(request) -> str:
    return request.param


@pytest.fixture(params=sorted(DOCUMENTS))
def kind(request) -> str:
    return request.param


class TestPreview:
    def test_writes_the_file_where_asked_and_nothing_else(self, payloads, tmp_path, engine, kind):
        build, _ = DOCUMENTS[kind]
        target = tmp_path / "somewhere" / "preview.pdf"

        written = render_preview_pdf(kind, build(payloads, engine, target))

        assert written == target.resolve()
        assert sorted(p.name for p in tmp_path.rglob("*") if p.is_file()) == ["preview.pdf"]

    def test_marks_every_page_as_a_draft(self, payloads, tmp_path, engine, kind):
        build, _ = DOCUMENTS[kind]
        target = tmp_path / "preview.pdf"

        render_preview_pdf(kind, build(payloads, engine, target))

        texts = _page_texts(target)
        assert len(texts) >= 2
        assert all(DRAFT_WATERMARK in text for text in texts)

    @pytest.mark.parametrize("theme", THEMES)
    @pytest.mark.parametrize("page_index", [0, 1])
    def test_centres_the_mark_on_the_sheet_on_the_first_and_the_following_pages(
        self, payloads, tmp_path, engine, theme, page_index
    ):
        target = tmp_path / "preview.pdf"
        render_preview_pdf("invoice", _invoice(payloads, engine, target, theme))

        x, y = _watermark_centre_mm(target, page_index, engine)

        assert (x, y) == pytest.approx(SHEET_CENTRE_MM, abs=CENTRE_TOLERANCE_MM if engine == "typst" else 0.5)

    def test_breaks_pages_like_the_issued_pdf(self, payloads, tmp_path, engine, kind):
        build, render_issued = DOCUMENTS[kind]
        issued = render_issued(build(payloads, engine, tmp_path / "issued.pdf"))

        preview = render_preview_pdf(kind, build(payloads, engine, tmp_path / "preview.pdf"))

        assert len(PdfReader(preview).pages) == len(PdfReader(issued).pages)

    def test_embeds_no_e_invoice_xml(self, payloads, tmp_path, engine):
        target = tmp_path / "preview.pdf"

        render_preview_pdf("invoice", _invoice(payloads, engine, target))

        assert PdfReader(target).attachments == {}
        assert extract_xml_only(str(target)) == {"found": False}

    def test_claims_no_pdf_a(self, payloads, tmp_path, engine, kind):
        build, _ = DOCUMENTS[kind]
        target = tmp_path / "preview.pdf"

        render_preview_pdf(kind, build(payloads, engine, target))

        assert PDF_A_MARKER not in _xmp_metadata(target)

    def test_carries_no_payment_qr_code(self, payloads, tmp_path, engine):
        target = tmp_path / "preview.pdf"

        render_preview_pdf("invoice", _invoice(payloads, engine, target))

        assert not any(PAYMENT_QR_CAPTION in text for text in _page_texts(target))

    def test_prints_the_numbers_the_issued_pdf_prints(self, payloads, tmp_path, engine):
        payload = _invoice(payloads, engine, tmp_path / "preview.pdf")
        payload["invoice"]["number"] = "Entwurf #0a1b"

        render_preview_pdf("invoice", payload)

        assert "Entwurf #0a1b" in _page_texts(tmp_path / "preview.pdf")[0]


class TestIssuedPdfIsUnchanged:
    def test_invoice_keeps_its_payment_qr_code(self, payloads, tmp_path, engine):
        target = tmp_path / "invoice.pdf"

        render_invoice_pdf(_invoice(payloads, engine, target))

        assert any(PAYMENT_QR_CAPTION in text for text in _page_texts(target))

    def test_invoice_has_no_watermark_but_the_xml_and_the_pdf_a_claim(self, payloads, tmp_path, engine):
        target = tmp_path / "invoice.pdf"

        render_invoice_pdf(_invoice(payloads, engine, target))

        assert not any(DRAFT_WATERMARK in text for text in _page_texts(target))
        assert extract_xml_only(str(target))["found"] is True
        assert PDF_A_MARKER in _xmp_metadata(target)

    def test_offer_has_no_watermark_but_the_pdf_a_claim(self, payloads, tmp_path, engine):
        target = tmp_path / "offer.pdf"

        render_offer_pdf(_offer(payloads, engine, target))

        assert not any(DRAFT_WATERMARK in text for text in _page_texts(target))
        assert PDF_A_MARKER in _xmp_metadata(target)

    def test_the_on_screen_sheet_carries_no_watermark(self, payloads):
        payload = payloads("03-five-positions.json")

        assert "draft-watermark" not in render_document_html("invoice", payload)


class TestGeneratePreviewCommand:
    def test_writes_the_preview_and_reports_its_path(self, payloads, tmp_path):
        target = tmp_path / "preview.pdf"
        payload = _invoice(payloads, "weasyprint", target)

        response = main.handle({"command": "generate_preview", "payload": {**payload, "kind": "invoice"}})

        assert response["success"] is True
        assert Path(response["pdfPath"]) == target.resolve()
        assert target.is_file()

    def test_needs_a_kind(self, payloads, tmp_path):
        payload = _invoice(payloads, "weasyprint", tmp_path / "preview.pdf")

        response = main.handle({"command": "generate_preview", "payload": payload})

        assert response["error"]["code"] == "MISSING_FIELD"

    @pytest.mark.parametrize("kind", ["reminder", "xrechnung", "nope"])
    def test_refuses_other_kinds(self, payloads, tmp_path, kind):
        payload = _invoice(payloads, "weasyprint", tmp_path / "preview.pdf")

        response = main.handle({"command": "generate_preview", "payload": {**payload, "kind": kind}})

        assert response["error"]["code"] == "INVALID_KIND"
        assert not (tmp_path / "preview.pdf").exists()

    @pytest.mark.parametrize("output_path", [None, ""])
    def test_needs_an_output_path_instead_of_writing_to_the_working_directory(self, payloads, tmp_path, output_path):
        payload = _invoice(payloads, "weasyprint", tmp_path / "preview.pdf")
        payload.pop("outputPath")
        if output_path is not None:
            payload["outputPath"] = output_path

        response = main.handle({"command": "generate_preview", "payload": {**payload, "kind": "invoice"}})

        assert response["error"]["code"] == "MISSING_FIELD"

    def test_reports_a_missing_payload_field(self, tmp_path):
        payload = {"kind": "invoice", "outputPath": str(tmp_path / "preview.pdf")}

        assert main.handle({"command": "generate_preview", "payload": payload})["error"]["code"] == "MISSING_FIELD"
