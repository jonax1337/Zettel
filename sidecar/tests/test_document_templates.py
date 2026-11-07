"""Shared template partials: every document type renders in every theme, and
user text is escaped."""
from __future__ import annotations

import re

import pytest
from pypdf import PdfReader

from invoice.pdf import (
    render_invoice_html,
    render_invoice_pdf,
    render_offer_html,
    render_offer_pdf,
    render_reminder_pdf,
)
from invoice.templates import nl2br

from .document_payloads import offer_payload as _offer_payload
from .document_payloads import reminder_payload as _reminder_payload

THEMES = ["classic", "modern", "minimal"]


def _text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


@pytest.mark.parametrize("theme", THEMES)
def test_every_document_type_renders_to_pdf_in_every_theme(payloads, tmp_path, theme):
    invoice = payloads("02-mixed-vat.json")
    invoice["settings"] = {"pdf_theme": theme}
    invoice["outputPath"] = str(tmp_path / "invoice.pdf")
    offer = _offer_payload(invoice)
    offer["settings"] = {"pdf_theme": theme}
    offer["outputPath"] = str(tmp_path / "offer.pdf")
    reminder = _reminder_payload(invoice)
    reminder["settings"] = {"pdf_theme": theme}
    reminder["outputPath"] = str(tmp_path / "reminder.pdf")

    for render, payload in [
        (render_invoice_pdf, invoice),
        (render_offer_pdf, offer),
        (render_reminder_pdf, reminder),
    ]:
        pdf = render(payload)
        assert pdf.read_bytes().startswith(b"%PDF"), f"{render.__name__} / {theme}"


class TestRunningPageFooter:
    def test_short_invoice_fits_on_one_page(self, payloads, tmp_path):
        payload = payloads("02-mixed-vat.json")
        payload["outputPath"] = str(tmp_path / "invoice.pdf")

        assert len(PdfReader(render_invoice_pdf(payload)).pages) == 1

    def test_every_page_carries_the_company_footer_and_page_count(self, payloads, tmp_path):
        payload = payloads("03-five-positions.json")
        payload["items"] = [dict(item, position=i + 1) for i, item in enumerate(payload["items"] * 4)]
        payload["outputPath"] = str(tmp_path / "invoice.pdf")

        pages = PdfReader(render_invoice_pdf(payload)).pages

        assert len(pages) > 1
        for number, page in enumerate(pages, start=1):
            text = page.extract_text()
            assert "Bankverbindung" in text and payload["company"]["vatId"] in text
            assert f"Seite {number} von {len(pages)}" in text

    def test_reminder_footer_carries_tax_ids(self, payloads, tmp_path):
        payload = _reminder_payload(payloads("02-mixed-vat.json"))
        payload["outputPath"] = str(tmp_path / "reminder.pdf")

        text = PdfReader(render_reminder_pdf(payload)).pages[0].extract_text()

        assert payload["company"]["taxNumber"] in text and "Seite 1 von 1" in text


def test_theme_class_reaches_the_body(payloads):
    payload = payloads("01-standard-19.json")
    payload["settings"] = {"pdf_theme": "modern"}

    assert '<body class="theme-modern">' in render_invoice_html(payload)


class TestUserTextIsEscaped:
    def test_nl2br_escapes_html_and_keeps_line_breaks(self):
        assert nl2br("a <b>x</b>\nb & c") == "a &lt;b&gt;x&lt;/b&gt;<br>b &amp; c"

    def test_nl2br_of_nothing_is_empty(self):
        assert nl2br(None) == ""

    def test_invoice_notes_and_item_details_cannot_inject_markup(self, payloads):
        payload = payloads("01-standard-19.json")
        payload["invoice"]["notes"] = 'Zeile 1\n<img src="http://evil.example/x.png">'
        payload["items"][0]["longDescription"] = "<script>alert(1)</script>\nDetail"

        html = render_invoice_html(payload)

        assert "<img src" not in html and "<script>" not in html
        assert "&lt;img src=&#34;http://evil.example/x.png&#34;&gt;" in html
        assert "Detail" in _text(html)

    def test_offer_intro_text_cannot_inject_markup(self, payloads):
        payload = _offer_payload(payloads("01-standard-19.json"))
        payload["offer"]["introText"] = "<b>fett</b>"

        assert "<b>fett</b>" not in render_offer_html(payload)
