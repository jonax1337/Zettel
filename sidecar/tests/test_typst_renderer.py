"""The Typst PDF engine: the same content as the WeasyPrint engine, PDF/A-3
with the Factur-X XML embedded, for every document type and theme."""
from __future__ import annotations

import re
from pathlib import Path

import pytest
import segno
from facturx import get_xml_from_pdf
from pypdf import PdfReader

from invoice.document_view import invoice_view
from invoice.pdf import render_invoice_pdf, render_offer_pdf, render_reminder_pdf
from invoice.zugferd import render_zugferd_xml

from .document_payloads import offer_payload, reminder_payload

PAYLOAD_DIR = Path(__file__).parent.parent / "test-payloads"
INVOICE_PAYLOADS = sorted(p.name for p in PAYLOAD_DIR.glob("*.json"))
THEMES = ["classic", "modern", "minimal"]
ENGINES = ["weasyprint", "typst"]
MIN_BOTTOM_CLEARANCE_PT = 14  # 5 mm: printers cut off what sits closer to the edge


def _render(render, payload: dict, tmp_path: Path, engine: str, theme: str = "classic") -> Path:
    return render({
        **payload,
        "settings": {"pdf_theme": theme, "pdf_renderer": engine},
        "outputPath": str(tmp_path / f"{engine}-{theme}.pdf"),
    })


def _words(pdf: Path) -> set[str]:
    text = " ".join(page.extract_text() for page in PdfReader(pdf).pages)
    return set(re.findall(r"\S+", text.casefold()))


def _text_heights(pdf: Path) -> list[tuple[str, float]]:
    """Every text run of the PDF with its height above the bottom page edge, in pt."""
    runs: list[tuple[str, float]] = []
    for page in PdfReader(pdf).pages:
        def visit(text, cm, tm, _font, _size):
            if text.strip():
                runs.append((text.strip(), cm[3] * tm[5] + cm[5]))
        page.extract_text(visitor_text=visit)
    return runs


class TestSameContentAsWeasyPrint:
    """Both engines must print the same words, so no legal notice, amount or
    tax ID can go missing in one of them. Layout is free to differ."""

    @pytest.mark.parametrize("name", INVOICE_PAYLOADS)
    def test_invoice(self, payloads, tmp_path, name):
        payload = payloads(name)

        weasy, typst = (_words(_render(render_invoice_pdf, payload, tmp_path, e)) for e in ENGINES)

        assert typst == weasy

    @pytest.mark.parametrize("build,render", [
        (offer_payload, render_offer_pdf),
        (reminder_payload, render_reminder_pdf),
    ])
    def test_offer_and_reminder(self, payloads, tmp_path, build, render):
        payload = build(payloads("02-mixed-vat.json"))

        weasy, typst = (_words(_render(render, payload, tmp_path, e)) for e in ENGINES)

        assert typst == weasy

    @pytest.mark.parametrize("invoice_changes", [
        {"amountPaidCent": 10000, "pdfLanguage": "en"},
        {"isCreditNote": True, "amountPaidCent": 5000,
         "correctsInvoice": {"number": "RE-2026-0001", "issueDate": 1747353600}},
        {"reverseChargeType": "third_country", "isReverseCharge": True, "supplyKind": "goods"},
    ])
    def test_invoice_variants(self, payloads, tmp_path, invoice_changes):
        payload = payloads("02-mixed-vat.json")
        payload["invoice"].update(invoice_changes)

        weasy, typst = (_words(_render(render_invoice_pdf, payload, tmp_path, e)) for e in ENGINES)

        assert typst == weasy

    @pytest.mark.parametrize("offer_changes", [
        {"isReverseCharge": True, "reverseChargeType": "intra_eu", "supplyKind": "goods"},
        {"reverseChargeType": "third_country", "isReverseCharge": True},
        {"skontoPercent": 2, "skontoDays": 7, "skontoAmountCent": 583, "notes": "Gilt ab Auftrag."},
        {"isKleinunternehmer": True, "pdfLanguage": "en"},
    ])
    def test_offer_variants(self, payloads, tmp_path, offer_changes):
        payload = offer_payload(payloads("02-mixed-vat.json"))
        payload["offer"].update(offer_changes)
        payload["company"] = {**payload["company"], "kleinunternehmerNote": "Gemäß § 19 UStG keine USt."}

        weasy, typst = (_words(_render(render_offer_pdf, payload, tmp_path, e)) for e in ENGINES)

        assert typst == weasy

    @pytest.mark.parametrize("company_changes", [{}, {"bankName": None, "bankIban": None, "bankBic": None}])
    def test_reminder_variants(self, payloads, tmp_path, company_changes):
        payload = reminder_payload(payloads("02-mixed-vat.json"))
        payload["reminder"]["interestCents"] = 120
        payload["company"] = {**payload["company"], **company_changes}

        weasy, typst = (_words(_render(render_reminder_pdf, payload, tmp_path, e)) for e in ENGINES)

        assert typst == weasy

    @pytest.mark.parametrize("build,render", [
        (lambda base: base, render_invoice_pdf),
        (offer_payload, render_offer_pdf),
        (reminder_payload, render_reminder_pdf),
    ])
    def test_company_register_details(self, payloads, tmp_path, build, render):
        base = payloads("02-mixed-vat.json")
        base["company"].update(registerCourt="Amtsgericht Berlin-Charlottenburg", registerNumber="HRB 123456 B",
                               managingDirectors="Erika Mustermann")
        payload = build(base)

        weasy, typst = (_words(_render(render, payload, tmp_path, e)) for e in ENGINES)

        assert typst == weasy
        assert {"geschäftsführung:", "hrb", "123456"} <= typst

    @pytest.mark.parametrize("engine", ENGINES)
    def test_english_documents_count_pages_in_english(self, payloads, tmp_path, engine):
        payload = payloads("01-standard-19.json")
        payload["invoice"]["pdfLanguage"] = "en"

        text = PdfReader(_render(render_invoice_pdf, payload, tmp_path, engine)).pages[0].extract_text()

        assert "Page 1 of 1" in text and "Seite" not in text


class TestTypstInvoiceIsAnEInvoice:
    def test_embeds_the_factur_x_xml(self, payloads, tmp_path):
        payload = payloads("02-mixed-vat.json")

        pdf = _render(render_invoice_pdf, payload, tmp_path, "typst")

        filename, xml = get_xml_from_pdf(pdf.read_bytes(), check_xsd=False)
        assert filename == "factur-x.xml"
        assert xml.decode("utf-8") == render_zugferd_xml(payload)

    def test_is_declared_pdf_a_3b(self, payloads, tmp_path):
        pdf = _render(render_invoice_pdf, payloads("01-standard-19.json"), tmp_path, "typst")

        xmp = PdfReader(pdf).trailer["/Root"]["/Metadata"].get_object().get_data().decode("utf-8")

        assert re.search(r"pdfaid:part(>|=\")3", xmp)
        assert re.search(r"pdfaid:conformance(>|=\")B", xmp)


@pytest.mark.parametrize("theme", THEMES)
@pytest.mark.parametrize("build,render", [
    (lambda base: base, render_invoice_pdf),
    (offer_payload, render_offer_pdf),
    (reminder_payload, render_reminder_pdf),
])
def test_every_document_type_renders_in_every_theme(payloads, tmp_path, theme, build, render):
    pdf = _render(render, build(payloads("02-mixed-vat.json")), tmp_path, "typst", theme)

    assert len(PdfReader(pdf).pages) == 1


def test_logo_from_outside_the_compile_root_is_printed(payloads, tmp_path):
    logo = tmp_path / "pictures" / "Logo.PNG"
    logo.parent.mkdir()
    segno.make("Zettel").save(logo, kind="png", scale=4)
    payload = payloads("01-standard-19.json")
    payload["company"]["logoPath"] = str(logo)

    page = PdfReader(_render(render_invoice_pdf, payload, tmp_path, "typst")).pages[0]

    assert len(page.images) == 1


class TestNothingFallsOffThePage:
    @pytest.mark.parametrize("engine", ENGINES)
    def test_a_description_longer_than_a_page_is_continued(self, payloads, tmp_path, engine):
        payload = payloads("01-standard-19.json")
        lines = [f"Arbeitsschritt-{n}" for n in range(150)]
        payload["items"][0]["longDescription"] = "\n".join(lines)

        visible = {text for text, height in _text_heights(_render(render_invoice_pdf, payload, tmp_path, engine))
                   if height > 0}

        assert set(lines) <= visible

    @pytest.mark.parametrize("engine", ENGINES)
    def test_a_long_company_footer_keeps_the_page_count_on_the_page(self, payloads, tmp_path, engine):
        payload = payloads("02-mixed-vat.json")
        payload["company"].update(
            companyName="Mustermann Softwareentwicklung & Beratung GmbH",
            street="Industriestraße 123, Gebäude C, 3. OG",
            email="buchhaltung@mustermann-software.de",
            bankName="Berliner Volksbank eG Filiale Mitte",
        )

        runs = _text_heights(_render(render_invoice_pdf, payload, tmp_path, engine))

        page_count_height = next(height for text, height in runs if "Seite 1 von" in text)
        assert page_count_height > MIN_BOTTOM_CLEARANCE_PT
        assert min(height for _, height in runs) > MIN_BOTTOM_CLEARANCE_PT


def test_logo_with_a_misleading_file_extension_is_printed(payloads, tmp_path):
    logo = tmp_path / "logo.jpg"
    segno.make("Zettel").save(logo, kind="png", scale=4)
    payload = payloads("01-standard-19.json")
    payload["company"]["logoPath"] = str(logo)

    page = PdfReader(_render(render_invoice_pdf, payload, tmp_path, "typst")).pages[0]

    assert len(page.images) == 1


def test_unreadable_logo_does_not_block_the_invoice(payloads, tmp_path):
    logo = tmp_path / "logo.png"
    logo.write_bytes(b"\x89PNG\r\n\x1a\n" + b"not really an image")
    payload = payloads("01-standard-19.json")
    payload["company"]["logoPath"] = str(logo)

    page = PdfReader(_render(render_invoice_pdf, payload, tmp_path, "typst")).pages[0]

    assert len(page.images) == 0


def test_customer_without_street_gets_no_blank_address_line(payloads):
    payload = payloads("02-mixed-vat.json")
    payload["customer"]["street"] = None

    assert invoice_view(payload)["recipient"]["lines"] == ["50667 Köln"]


def test_missing_logo_file_is_skipped(payloads, tmp_path):
    payload = payloads("01-standard-19.json")
    payload["company"]["logoPath"] = str(tmp_path / "gone.png")

    page = PdfReader(_render(render_invoice_pdf, payload, tmp_path, "typst")).pages[0]

    assert len(page.images) == 0


def test_unknown_engine_is_rejected(payloads, tmp_path):
    with pytest.raises(ValueError, match="PDF-Engine"):
        _render(render_invoice_pdf, payloads("01-standard-19.json"), tmp_path, "latex")


def test_without_a_setting_the_engine_is_weasyprint(payloads, tmp_path):
    payload = payloads("01-standard-19.json")
    payload["outputPath"] = str(tmp_path / "default.pdf")

    producer = PdfReader(render_invoice_pdf(payload)).metadata.get("/Producer", "")

    assert "WeasyPrint" in producer
