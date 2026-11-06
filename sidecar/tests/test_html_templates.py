"""Render the PDF HTML templates (invoice/offer/reminder) without WeasyPrint."""
import copy
import re
from unittest import mock

import pytest

from invoice import pdf
from invoice.templates import build_env

IBAN_GROUPED = "".join(f'<span class="iban-g">{g}</span>' for g in ("DE89", "3704", "0044", "0532", "0130", "00"))
KU_NOTE = "Gem. § 19 UStG wird keine Umsatzsteuer berechnet."


def _render_invoice(p, qr=None, logo=None):
    """Same entry point the PDF uses; QR and logo are stubbed so tests stay about the template."""
    with mock.patch.object(pdf, "_maybe_epc_qr", return_value=qr), \
            mock.patch.object(pdf, "_logo_data_uri", return_value=logo):
        return pdf.render_invoice_html(dict(p, settings=p.get("settings") or {}))


def _invoice(payloads, name="01-standard-19.json", settings=None, epc_qr_uri=None, **inv):
    p = copy.deepcopy(payloads(name))
    p["invoice"].update(inv)
    p["settings"] = settings or {"pdf_theme": "classic"}
    return _render_invoice(p, qr=epc_qr_uri)


def _offer(payloads, settings=None, company=None, **offer):
    p = copy.deepcopy(payloads("01-standard-19.json"))
    o = {
        "number": "AN-2026-0001",
        "issueDate": 1747353600,
        "validUntil": 1750032000,
        "subtotal": 120000,
        "vatAmount": 22800,
        "total": 142800,
    }
    o.update(offer)
    p.update(offer=o, settings=settings or {"pdf_theme": "classic"})
    p["company"].update(company or {})
    with mock.patch.object(pdf, "_logo_data_uri", return_value=None):
        return pdf.render_offer_html(p)


def _reminder(payloads, company=None, **rem):
    p = copy.deepcopy(payloads("01-standard-19.json"))
    r = {
        "number": "MA-2026-0001",
        "levelLabel": "1. Mahnung",
        "issueDate": 1750032000,
        "dueDate": 1751241600,
        "bodyText": "bitte begleichen Sie den offenen Betrag.\nDanke.",
        "originalTotalCents": 142800,
        "feeCents": 0,
        "interestCents": 0,
        "totalDueCents": 142800,
    }
    r.update(rem)
    inv = {
        "invoiceNumber": "RE-2026-0007",
        "invoiceIssueDate": 1747353600,
        "invoiceDueDate": 1748563200,
    }
    p.update(reminder=r, invoice=inv, settings={"pdf_theme": "classic"})
    p["company"].update(company or {})
    with mock.patch.object(pdf, "_logo_data_uri", return_value=None):
        return pdf.render_reminder_html(p)


class TestInvoiceHtml:
    def test_standard_invoice_header_parties_totals(self, payloads):
        html = _invoice(payloads)
        assert "<title>Rechnung RE-2026-TEST-01</title>" in html
        assert '<div class="docnumber">RE-2026-TEST-01</div>' in html
        assert "Acme GmbH" in html and "80331 München" in html
        assert "Fällig am" in html and "30.05.2025" in html
        assert "1.200,00 €" in html and "228,00 €" in html and "1.428,00 €" in html
        assert 'class="col-vat"' in html

    @pytest.mark.parametrize("theme", ["classic", "modern", "minimal"])
    def test_theme_class_on_body(self, payloads, theme):
        assert f'<body class="theme-{theme}">' in _invoice(payloads, settings={"pdf_theme": theme})

    @pytest.mark.parametrize("settings", [None, {}, {"pdf_theme": ""}, {"pdf_theme": None}])
    def test_theme_defaults_to_classic(self, payloads, settings):
        assert '<body class="theme-classic">' in _invoice(payloads, settings=settings or {})

    def test_every_theme_is_defined_in_css(self):
        css = (build_env().loader.searchpath[0] + "/invoice.css")
        text = open(css, encoding="utf-8").read()
        for theme in ("classic", "modern", "minimal"):
            assert f"body.theme-{theme}" in text

    def test_english_language(self, payloads):
        html = _invoice(payloads, pdfLanguage="en")
        assert '<html lang="en">' in html
        assert "<title>Invoice RE-2026-TEST-01</title>" in html
        assert "Due date" in html and "Fällig am" not in html

    def test_kleinunternehmer_hides_vat_and_shows_note(self, payloads):
        p = payloads("04-ku-with-vatid.json")
        html = _invoice(
            payloads, "04-ku-with-vatid.json", isKleinunternehmer=True, vatAmount=0
        )
        assert 'class="col-vat"' not in html
        assert "Umsatzsteuer</th>" not in html and "MwSt" not in html.split("<table class=\"totals\">")[1]
        note = p["company"].get("kleinunternehmerNote")
        if note:
            assert note in html

    def test_kleinunternehmer_note_rendered_only_for_ku_invoice(self, payloads):
        p = copy.deepcopy(payloads("01-standard-19.json"))

        def render(is_ku):
            return _render_invoice(dict(
                p, invoice=dict(p["invoice"], isKleinunternehmer=is_ku),
                company=dict(p["company"], kleinunternehmerNote=KU_NOTE),
            ))

        assert KU_NOTE in render(True)
        assert KU_NOTE not in render(False)

    @pytest.mark.parametrize("rc,kind,needle", [
        ("intra_eu", "services", "Steuerschuldnerschaft des Leistungsempfängers"),
        ("third_country", "goods", "Steuerfreie Ausfuhrlieferung"),
    ])
    def test_reverse_charge_notice(self, payloads, rc, kind, needle):
        html = _invoice(payloads, "05-reverse-charge.json", reverseChargeType=rc, supplyKind=kind)
        assert needle in html
        assert 'class="col-vat"' not in html

    def test_no_reverse_charge_notice_on_standard(self, payloads):
        html = _invoice(payloads)
        assert "Steuerschuldnerschaft" not in html and "Ausfuhrlieferung" not in html

    def test_credit_note_negates_lines_and_hides_due_date(self, payloads):
        html = _invoice(
            payloads,
            isCreditNote=True,
            correctsInvoice={"number": "RE-2026-0001", "issueDate": 1747353600},
        )
        assert "<title>Stornorechnung RE-2026-TEST-01</title>" in html
        assert "Storno zur Rechnung RE-2026-0001 vom 16.05.2025." in html
        assert "-1.200,00 €" in html.split('class="col-total"')[2]
        assert "Fällig am" not in html
        assert "Erstattung" in html

    def test_credit_note_without_reference_has_no_callout(self, payloads):
        assert "Storno zur Rechnung" not in _invoice(payloads, isCreditNote=True)

    def test_partial_payment_shows_remaining(self, payloads):
        html = _invoice(payloads, amountPaidCent=42800)
        assert "Bereits gezahlt" in html and "− 428,00 €" in html
        assert "Noch offen" in html and "1.000,00 €" in html

    @pytest.mark.parametrize("paid", [None, 0])
    def test_no_payment_block_when_nothing_paid(self, payloads, paid):
        html = _invoice(payloads, amountPaidCent=paid)
        assert "Bereits gezahlt" not in html and "Noch offen" not in html

    def test_service_period_wins_over_delivery_date(self, payloads):
        html = _invoice(payloads, servicePeriodStart=1746057600, servicePeriodEnd=1748649600)
        assert "Leistungszeitraum" in html and "01.05.2025 – 31.05.2025" in html
        assert "Lieferdatum" not in html

    def test_delivery_date_when_no_service_period(self, payloads):
        html = _invoice(payloads)
        assert "Leistungszeitraum" not in html
        assert "Lieferdatum" in html or "Leistungsdatum" in html

    def test_line_period_single_vs_range(self, payloads):
        p = copy.deepcopy(payloads("01-standard-19.json"))

        def render(start, end):
            items = [dict(p["items"][0], linePeriodStart=start, linePeriodEnd=end)]
            return _render_invoice(dict(p, items=items))

        assert "Leistungsdatum 16.05.2025" in render(1747353600, 1747353600)
        assert "Leistungszeitraum 01.05.2025 – 31.05.2025" in render(1746057600, 1748649600)
        assert 'class="item-period"' not in render(None, None)

    def test_long_description_and_notes_newlines_become_br(self, payloads):
        p = copy.deepcopy(payloads("01-standard-19.json"))
        items = [dict(p["items"][0], longDescription="Zeile A\nZeile B")]
        html = _render_invoice(dict(p, invoice=dict(p["invoice"], notes="N1\nN2"), items=items))
        assert "Zeile A<br>Zeile B" in html and "N1<br>N2" in html

    def test_user_strings_are_escaped(self, payloads):
        p = copy.deepcopy(payloads("01-standard-19.json"))
        p["customer"]["name"] = "A & B <script>x</script>"
        html = _render_invoice(p)
        assert "A &amp; B &lt;script&gt;x&lt;/script&gt;" in html
        assert "<script>" not in html

    def test_foreign_customer_shows_country_domestic_does_not(self, payloads):
        assert "<div>NL</div>" in _invoice(payloads, "05-reverse-charge.json")
        assert "<div>DE</div>" not in _invoice(payloads)

    def test_payment_terms_skonto_and_qr(self, payloads):
        html = _invoice(
            payloads,
            skontoPercent=2.0, skontoDays=7, skontoAmountCent=2856, skontoDeadline=1747958400,
            epc_qr_uri="data:image/svg+xml;base64,AAAA",
        )
        assert "Zahlbar innerhalb von 14 Tagen ohne Abzug." in html
        assert "Bei Zahlung bis 23.05.2025: 2.0 % Skonto = 28,56 €" in html
        assert '<img class="epc-qr" src="data:image/svg+xml;base64,AAAA"' in html
        assert "QR-Code scannen" in html

    def test_payment_block_absent_without_terms_skonto_or_qr(self, payloads):
        html = _invoice(payloads, paymentTerms=None)
        assert 'class="block payment-block"' not in html

    def test_foreign_currency_symbol(self, payloads):
        html = _invoice(payloads, currency="USD")
        assert "1.428,00 $" in html and "1.428,00 €" not in html

    def test_footer_company_data(self, payloads):
        html = _invoice(payloads)
        footer = html.split('<footer class="doc-footer">')[1]
        assert IBAN_GROUPED in footer and "COBADEFFXXX" in footer
        assert "DE123456789" in footer and "12/345/67890" in footer

    def test_logo_rendered_only_when_present(self, payloads):
        p = copy.deepcopy(payloads("01-standard-19.json"))
        assert 'class="brand-logo"' not in _render_invoice(p)
        assert 'src="data:image/png;base64,QQ=="' in _render_invoice(p, logo="data:image/png;base64,QQ==")

    def test_missing_optional_values_never_render_none(self, payloads):
        html = _invoice(payloads, notes=None, paymentTerms=None, dueDate=None)
        assert "None" not in re.sub(r"<[^>]+>", " ", html)


class TestOfferHtml:
    def test_header_dates_and_totals(self, payloads):
        html = _offer(payloads)
        assert "<title>Angebot AN-2026-0001</title>" in html
        assert "Acme GmbH" in html
        assert "16.05.2025" in html and "16.06.2025" in html
        assert "1.428,00 €" in html and "Gültig bis 16.06.2025" in html

    def test_english_language(self, payloads):
        html = _offer(payloads, pdfLanguage="en")
        assert "<title>Quotation AN-2026-0001</title>" in html
        assert "non-binding" in html

    @pytest.mark.parametrize("theme", ["classic", "modern", "minimal"])
    def test_theme_class(self, payloads, theme):
        assert f'theme-{theme}"' in _offer(payloads, settings={"pdf_theme": theme})

    def test_kleinunternehmer_hides_vat_and_shows_note(self, payloads):
        html = _offer(payloads, company={"kleinunternehmerNote": KU_NOTE}, isKleinunternehmer=True)
        assert KU_NOTE in html and 'class="col-vat"' not in html

    def test_reverse_charge_hint(self, payloads):
        assert "Steuerschuldnerschaft des Leistungsempfängers" in _offer(payloads, isReverseCharge=True)
        assert "Reverse Charge" not in _offer(payloads)

    def test_intro_text_and_skonto_block(self, payloads):
        html = _offer(
            payloads, introText="Hallo\nWelt",
            skontoPercent=2.0, skontoDays=7, skontoAmountCent=2856,
        )
        assert "Hallo<br>Welt" in html
        assert "innerhalb von 7 Tagen ab Rechnungsdatum gewähren wir 2.0 % Skonto" in html

    def test_skonto_block_needs_all_three_fields(self, payloads):
        assert "Skonto" not in _offer(payloads, skontoPercent=2.0, skontoDays=7)

    def test_service_period_row(self, payloads):
        html = _offer(payloads, servicePeriodStart=1746057600, servicePeriodEnd=1748649600)
        assert "01.05.2025 – 31.05.2025" in html

    def test_no_none_literal(self, payloads):
        assert "None" not in re.sub(r"<[^>]+>", " ", _offer(payloads))


class TestReminderHtml:
    def test_reference_table_and_total(self, payloads):
        html = _reminder(payloads)
        assert "<title>1. Mahnung MA-2026-0001</title>" in html
        assert "Rechnung RE-2026-0007" in html
        assert "16.05.2025" in html and "30.05.2025" in html
        assert "1.428,00 €" in html
        assert "bitte begleichen Sie den offenen Betrag.\nDanke." in html

    def test_fee_and_interest_rows_only_when_positive(self, payloads):
        base = _reminder(payloads)
        assert "5,00 €" not in base and "2,50 €" not in base
        html = _reminder(payloads, feeCents=500, interestCents=250, totalDueCents=143550)
        assert "5,00 €" in html and "2,50 €" in html and "1.435,50 €" in html

    def test_bank_block_and_payment_reference(self, payloads):
        html = _reminder(payloads)
        assert "IBAN: " + IBAN_GROUPED in html
        assert "BIC: COBADEFFXXX" in html
        assert "Verwendungszweck: RE-2026-0007" in html

    def test_bank_block_hidden_without_bank_data(self, payloads):
        html = _reminder(payloads, company={"bankName": None, "bankIban": None})
        assert "IBAN:" not in html and "Verwendungszweck" not in html

    def test_body_text_is_escaped(self, payloads):
        html = _reminder(payloads, bodyText="<b>x</b> & y")
        assert "&lt;b&gt;x&lt;/b&gt; &amp; y" in html and "<b>x</b>" not in html

    def test_no_none_literal(self, payloads):
        assert "None" not in re.sub(r"<[^>]+>", " ", _reminder(payloads))


def test_iban_filter_groups_by_four_without_space_characters():
    from invoice.templates import fmt_iban

    for raw in ("de89370400440532013000", "DE89 3704-0044 0532 0130 00"):
        out = str(fmt_iban(raw))
        assert out == IBAN_GROUPED
        assert " " not in out.replace('<span class="iban-g">', "")
    assert str(fmt_iban(None)) == ""
