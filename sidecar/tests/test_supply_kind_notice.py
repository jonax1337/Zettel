"""Mandatory notice for EU reverse-charge documents depends on the supply kind.

'goods' is an intra-community supply (§ 6a UStG), 'services' a reverse-charge
service (§ 13b UStG). Rendered through the real templates; no PDF engine needed.
"""
from __future__ import annotations

import pytest

from invoice.templates import build_env

GOODS_DE = "innergemeinschaftliche Lieferung (§ 4 Nr. 1b i. V. m. § 6a UStG)"
SERVICES_DE = "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge, § 13b UStG / Art. 196 MwStSystRL)"
GOODS_EN = "intra-community supply (§ 4 No. 1b in conjunction with § 6a UStG)"
SERVICES_EN = "Reverse charge — VAT to be paid by the recipient (§ 13b UStG / Art. 196 VAT Directive)"


def _render_invoice(payloads, **invoice_overrides) -> str:
    payload = payloads("05-reverse-charge.json")
    invoice = {**payload["invoice"], "reverseChargeType": "intra_eu", **invoice_overrides}
    return build_env().get_template("invoice.html.j2").render(
        company=payload["company"],
        customer=payload["customer"],
        settings={"pdf_theme": "classic"},
        invoice=invoice,
        items=payload["items"],
        epc_qr_uri=None,
    )


def _render_offer(payloads, **offer_overrides) -> str:
    payload = payloads("05-reverse-charge.json")
    invoice = payload["invoice"]
    offer = {
        "number": "AN-2026-0001",
        "issueDate": invoice["issueDate"],
        "validUntil": invoice["dueDate"],
        "subtotal": invoice["subtotal"],
        "vatAmount": invoice["vatAmount"],
        "total": invoice["total"],
        "isKleinunternehmer": False,
        "isReverseCharge": True,
        **offer_overrides,
    }
    return build_env().get_template("offer.html.j2").render(
        company=payload["company"],
        customer=payload["customer"],
        settings={"pdf_theme": "classic"},
        offer=offer,
        items=payload["items"],
    )


class TestInvoiceNotice:
    def test_goods_prints_intra_community_supply(self, payloads):
        html = _render_invoice(payloads, supplyKind="goods")
        assert GOODS_DE in html
        assert "§ 13b" not in html

    def test_services_prints_reverse_charge(self, payloads):
        html = _render_invoice(payloads, supplyKind="services")
        assert SERVICES_DE in html
        assert "§ 6a" not in html

    def test_missing_supply_kind_falls_back_to_reverse_charge(self, payloads):
        assert SERVICES_DE in _render_invoice(payloads)

    def test_english_goods(self, payloads):
        assert GOODS_EN in _render_invoice(payloads, supplyKind="goods", pdfLanguage="en")

    def test_english_services(self, payloads):
        assert SERVICES_EN in _render_invoice(payloads, supplyKind="services", pdfLanguage="en")

    def test_german_notice_carries_english_translation(self, payloads):
        assert "Reverse charge — VAT to be paid by the recipient." in _render_invoice(payloads, supplyKind="services")
        assert "VAT-exempt intra-community supply." in _render_invoice(payloads, supplyKind="goods")

    def test_third_country_goods_prints_export_notice(self, payloads):
        html = _render_invoice(payloads, reverseChargeType="third_country", supplyKind="goods")
        assert "Steuerfreie Ausfuhrlieferung" in html
        assert "§ 3a" not in html

    def test_third_country_services_prints_place_of_supply_notice(self, payloads):
        html = _render_invoice(payloads, reverseChargeType="third_country", supplyKind="services")
        assert "Nicht im Inland steuerbare Leistung (§ 3a Abs. 2 UStG)" in html
        assert "Ausfuhrlieferung" not in html

    @pytest.mark.parametrize("supply_kind", ["goods", "services"])
    def test_no_notice_without_reverse_charge(self, payloads, supply_kind):
        html = _render_invoice(payloads, reverseChargeType="none", supplyKind=supply_kind)
        assert "§ 6a" not in html
        assert "§ 13b" not in html


class TestOfferHint:
    def test_goods_announces_intra_community_supply(self, payloads):
        html = _render_offer(payloads, supplyKind="goods")
        assert "steuerfreie innergemeinschaftliche Lieferung" in html

    def test_services_announces_reverse_charge(self, payloads):
        html = _render_offer(payloads, supplyKind="services")
        assert "Steuerschuldnerschaft des Leistungsempfängers" in html

    def test_english_goods(self, payloads):
        html = _render_offer(payloads, supplyKind="goods", pdfLanguage="en")
        assert "VAT-exempt intra-community supply" in html

    def test_english_services(self, payloads):
        html = _render_offer(payloads, supplyKind="services", pdfLanguage="en")
        assert "VAT to be paid by the recipient (reverse charge)" in html

    def test_third_country_goods_announces_export(self, payloads):
        html = _render_offer(payloads, reverseChargeType="third_country", supplyKind="goods")
        assert "steuerfreie Ausfuhrlieferung" in html
        assert "innergemeinschaftliche" not in html

    def test_third_country_services_announces_place_of_supply_outside_eu(self, payloads):
        html = _render_offer(payloads, reverseChargeType="third_country", supplyKind="services")
        assert "Leistungsort außerhalb der EU" in html
        assert "Steuerschuldnerschaft" not in html

    def test_english_third_country(self, payloads):
        goods = _render_offer(payloads, reverseChargeType="third_country", supplyKind="goods", pdfLanguage="en")
        services = _render_offer(payloads, reverseChargeType="third_country", supplyKind="services", pdfLanguage="en")
        assert "VAT-exempt export" in goods
        assert "place of supply outside the EU" in services

    def test_offer_without_type_keeps_intra_eu_hint(self, payloads):
        html = _render_offer(payloads, supplyKind="goods")
        assert "steuerfreie innergemeinschaftliche Lieferung" in html
