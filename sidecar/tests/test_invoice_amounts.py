"""Amount lines on the invoice PDF and in the XML: paid/open balance, credit
notes, EPC-QR amount and the per-rate VAT breakdown (§ 14 Abs. 4 Nr. 7/8 UStG)."""
from __future__ import annotations

import re
from xml.etree import ElementTree as ET

import pytest

from invoice.pdf import render_invoice_html
from invoice.zugferd import render_zugferd_xml

NS = {"ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"}


def _text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def _summation(xml: str) -> dict[str, str]:
    root = ET.fromstring(xml)
    summation = root.find(".//ram:SpecifiedTradeSettlementHeaderMonetarySummation", NS)
    return {child.tag.split("}")[1]: child.text for child in summation}


def _credit_note(payloads, paid_cent: int) -> dict:
    payload = payloads("01-standard-19.json")
    invoice = payload["invoice"]
    invoice.update(
        isCreditNote=True,
        subtotal=-invoice["subtotal"],
        vatAmount=-invoice["vatAmount"],
        total=-invoice["total"],
        amountPaidCent=paid_cent,
    )
    return payload


class TestCreditNotePaidBalance:
    def test_paid_credit_note_has_nothing_due(self, payloads):
        payload = _credit_note(payloads, paid_cent=11900)
        payload["invoice"]["total"] = -11900

        summation = _summation(render_zugferd_xml(payload))

        assert summation["GrandTotalAmount"] == "-119.00"
        assert summation["TotalPrepaidAmount"] == "-119.00"
        assert summation["DuePayableAmount"] == "0.00"

    def test_partly_paid_credit_note_keeps_the_rest_due(self, payloads):
        payload = _credit_note(payloads, paid_cent=4000)
        payload["invoice"]["total"] = -11900

        summation = _summation(render_zugferd_xml(payload))

        assert summation["TotalPrepaidAmount"] == "-40.00"
        assert summation["DuePayableAmount"] == "-79.00"

    def test_unpaid_credit_note_omits_prepaid(self, payloads):
        payload = _credit_note(payloads, paid_cent=0)
        payload["invoice"]["total"] = -11900

        summation = _summation(render_zugferd_xml(payload))

        assert "TotalPrepaidAmount" not in summation
        assert summation["DuePayableAmount"] == "-119.00"

    def test_pdf_shows_refund_and_zero_remaining(self, payloads):
        payload = _credit_note(payloads, paid_cent=11900)
        payload["invoice"]["total"] = -11900

        text = _text(render_invoice_html(payload))

        assert "Bereits erstattet -119,00" in text
        assert "Noch offen 0,00" in text

    def test_regular_invoice_balance_is_unchanged(self, payloads):
        payload = payloads("01-standard-19.json")
        payload["invoice"]["amountPaidCent"] = 4000

        summation = _summation(render_zugferd_xml(payload))
        text = _text(render_invoice_html(payload))

        assert summation["TotalPrepaidAmount"] == "40.00"
        assert summation["DuePayableAmount"] == "%.2f" % ((payload["invoice"]["total"] - 4000) / 100)
        assert "Bereits gezahlt − 40,00" in text


def _qr_amount(payloads, paid_cent: int) -> str | None:
    import base64

    payload = payloads("01-standard-19.json")
    payload["invoice"]["amountPaidCent"] = paid_cent
    html = render_invoice_html(payload)
    match = re.search(r'src="data:image/svg\+xml;base64,([^"]+)"', html)
    if match is None:
        return None
    return base64.b64decode(match.group(1)).decode("utf-8")


class TestEpcQrAmount:
    def test_qr_is_present_for_an_unpaid_invoice(self, payloads):
        assert _qr_amount(payloads, paid_cent=0) is not None

    def test_qr_encodes_the_open_balance(self, payloads, monkeypatch):
        captured: dict = {}
        import invoice.pdf as pdf

        real = pdf.build_epc_payload

        def spy(**kwargs):
            captured.update(kwargs)
            return real(**kwargs)

        monkeypatch.setattr(pdf, "build_epc_payload", spy)
        payload = payloads("01-standard-19.json")
        total = payload["invoice"]["total"]
        payload["invoice"]["amountPaidCent"] = 4000

        render_invoice_html(payload)

        assert captured["amount_cent"] == total - 4000

    def test_no_qr_when_nothing_is_open(self, payloads):
        payload = payloads("01-standard-19.json")
        payload["invoice"]["amountPaidCent"] = payload["invoice"]["total"]

        assert 'class="epc-qr"' not in render_invoice_html(payload)


class TestVatBreakdown:
    def test_mixed_rates_list_net_and_tax_per_rate(self, payloads):
        payload = payloads("02-mixed-vat.json")

        text = _text(render_invoice_html(payload))

        assert "Nettobetrag 7 %" in text
        assert "Umsatzsteuer 7 %" in text
        assert "Nettobetrag 19 %" in text
        assert "Umsatzsteuer 19 %" in text

    def test_amounts_per_rate_match_the_xml_groups(self, payloads):
        payload = payloads("02-mixed-vat.json")
        xml = ET.fromstring(render_zugferd_xml(payload))
        groups = {
            g.find("ram:RateApplicablePercent", NS).text: (
                g.find("ram:BasisAmount", NS).text,
                g.find("ram:CalculatedAmount", NS).text,
            )
            for g in xml.findall(".//ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax", NS)
        }
        text = _text(render_invoice_html(payload))

        for rate, (basis, tax) in groups.items():
            shown_basis = "{:,.2f}".format(float(basis)).replace(",", "X").replace(".", ",").replace("X", ".")
            shown_tax = "{:,.2f}".format(float(tax)).replace(",", "X").replace(".", ",").replace("X", ".")
            rate_label = rate.rstrip("0").rstrip(".")
            assert f"Nettobetrag {rate_label} % {shown_basis}" in text
            assert f"Umsatzsteuer {rate_label} % {shown_tax}" in text

    def test_single_rate_labels_the_rate_without_net_row(self, payloads):
        text = _text(render_invoice_html(payloads("01-standard-19.json")))

        assert "Umsatzsteuer 19 %" in text
        assert "Nettobetrag" not in text

    def test_kleinunternehmer_shows_no_vat_line(self, payloads):
        payload = payloads("01-standard-19.json")
        payload["invoice"]["isKleinunternehmer"] = True

        assert "Umsatzsteuer" not in _text(render_invoice_html(payload))

    def test_reverse_charge_shows_no_vat_line(self, payloads):
        payload = payloads("05-reverse-charge.json")
        payload["invoice"]["reverseChargeType"] = "intra_eu"

        text = _text(render_invoice_html(payload))

        assert "Umsatzsteuer %" not in text and "Nettobetrag" not in text

    @pytest.mark.parametrize("rate,expected", [(19, "19"), (7, "7"), (7.5, "7,5"), (0, "0")])
    def test_rate_formatting(self, rate, expected):
        from invoice.templates import fmt_rate

        assert fmt_rate(rate) == expected
