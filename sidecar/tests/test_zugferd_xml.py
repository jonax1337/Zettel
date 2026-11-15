"""Golden-file tests for ZUGFeRD/Factur-X XML generation.

The XML must remain byte-stable across refactors for any given payload,
otherwise we silently break the Factur-X compliance contract. A failing
test means: either the payload changed (re-record), or the template
changed (intentional → re-record + bump migration discipline; unintentional → fix).

Regenerate goldens with: pytest sidecar/tests/test_zugferd_xml.py --record
"""
from __future__ import annotations

import re
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest
from facturx import xml_check_xsd

from invoice.vat import vat_groups
from invoice.zugferd import (
    XRECHNUNG_GUIDELINE_URN,
    render_xrechnung_xml,
    render_zugferd_xml,
)

GOLDEN_DIR = Path(__file__).parent / "goldens"
GOLDEN_DIR.mkdir(exist_ok=True)

NS = {
    "rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
    "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
}


def _normalize(xml: str) -> str:
    return re.sub(r"\s+", " ", xml.strip())


def _xpath_text(xml: str, path: str) -> str | None:
    root = ET.fromstring(xml)
    el = root.find(path, NS)
    return el.text if el is not None else None


def _xpath_all(xml: str, path: str) -> list[ET.Element]:
    root = ET.fromstring(xml)
    return root.findall(path, NS)


def _seller(xml: str) -> ET.Element:
    seller = ET.fromstring(xml).find(".//ram:SellerTradeParty", NS)
    assert seller is not None
    return seller


def _assert_matches_golden(xml: str, golden_name: str, request) -> None:
    golden = GOLDEN_DIR / f"{golden_name}.xml"
    if request.config.getoption("--record", default=False) or not golden.exists():
        golden.write_text(xml, encoding="utf-8")
        pytest.skip(f"recorded golden: {golden.name}")

    expected = golden.read_text(encoding="utf-8")
    assert _normalize(xml) == _normalize(expected), (
        f"XML drift in {golden_name}. "
        f"If intentional, re-record with: pytest --record"
    )


class TestZugferdGoldens:
    @pytest.mark.parametrize("golden_name,payload_name,reverse_charge_type", [
        ("01-standard-19", "01-standard-19.json", None),
        ("02-mixed-vat", "02-mixed-vat.json", None),
        ("03-five-positions", "03-five-positions.json", None),
        ("04-ku-with-vatid", "04-ku-with-vatid.json", None),
        ("05-reverse-charge", "05-reverse-charge.json", None),
        ("05-reverse-charge-third-country", "05-reverse-charge.json", "third_country"),
        ("06-basic", "06-basic.json", None),
        ("07-extended", "07-extended.json", None),
        ("13-hourly-service-periods", "13-hourly-service-periods.json", None),
    ])
    def test_xml_matches_golden(self, payloads, golden_name, payload_name, reverse_charge_type, request):
        payload = payloads(payload_name)
        if reverse_charge_type:
            payload["invoice"]["reverseChargeType"] = reverse_charge_type
        _assert_matches_golden(render_zugferd_xml(payload), golden_name, request)


class TestXRechnungGoldens:
    @pytest.mark.parametrize("payload_name", [
        "08-xrechnung-standard-19.json",
        "09-xrechnung-storno.json",
        "10-xrechnung-reverse-charge.json",
        "11-xrechnung-skonto.json",
        "12-xrechnung-kleinunternehmer.json",
    ])
    def test_xml_matches_golden(self, payloads, payload_name, request):
        _assert_matches_golden(
            render_xrechnung_xml(payloads(payload_name)), payload_name.removesuffix(".json"), request
        )


class TestHourlyTimeBilling:
    """Positions created by the time tracking: hours as 'Std' with the work days as line period."""

    @staticmethod
    def _lines(xml: str) -> list[ET.Element]:
        return _xpath_all(xml, ".//ram:IncludedSupplyChainTradeLineItem")

    def test_hours_are_billed_as_unit_hur_with_two_decimals(self, payloads):
        xml = render_zugferd_xml(payloads("13-hourly-service-periods.json"))

        quantities = [
            line.find(".//ram:BilledQuantity", NS) for line in self._lines(xml)
        ]

        assert [(q.get("unitCode"), q.text) for q in quantities] == [("HUR", "1.5"), ("HUR", "0.25")]

    def test_every_position_carries_its_work_days_as_billing_period(self, payloads):
        xml = render_zugferd_xml(payloads("13-hourly-service-periods.json"))

        periods = []
        for line in self._lines(xml):
            period = line.find(".//ram:BillingSpecifiedPeriod", NS)
            periods.append((
                period.find("./ram:StartDateTime/udt:DateTimeString", NS).text,
                period.find("./ram:EndDateTime/udt:DateTimeString", NS).text,
            ))

        assert periods == [("20260505", "20260507"), ("20260506", "20260506")]

    def test_the_invoice_period_spans_all_work_days(self, payloads):
        xml = render_zugferd_xml(payloads("13-hourly-service-periods.json"))

        assert _xpath_text(
            xml,
            ".//ram:ApplicableHeaderTradeSettlement/ram:BillingSpecifiedPeriod/ram:StartDateTime/udt:DateTimeString",
        ) == "20260505"
        assert _xpath_text(
            xml,
            ".//ram:ApplicableHeaderTradeSettlement/ram:BillingSpecifiedPeriod/ram:EndDateTime/udt:DateTimeString",
        ) == "20260507"


class TestZugferdSemantics:
    """Semantic invariants — these must hold regardless of golden re-records."""

    def test_standard_invoice_has_seller_vat_id(self, payloads):
        xml = render_zugferd_xml(payloads("01-standard-19.json"))
        assert "DE123456789" in xml

    def test_kleinunternehmer_falls_back_to_tax_number(self, payloads):
        """BR-CO-26: seller must be identifiable. Without VAT-ID we emit the
        tax number as BT-29 (<ram:ID> directly under SellerTradeParty, before
        <ram:Name>), in addition to the FC tax registration."""
        payload = payloads("04-ku-with-vatid.json")
        payload["company"]["vatId"] = None
        xml = render_zugferd_xml(payload)
        seller = _seller(xml)
        tags = [c.tag.split("}")[1] for c in seller]
        assert tags[:2] == ["ID", "Name"]
        assert seller.find("ram:ID", NS).text == payload["company"]["taxNumber"]

    def test_seller_with_vat_id_has_no_bt29_fallback(self, payloads):
        xml = render_zugferd_xml(payloads("04-ku-with-vatid.json"))
        seller = _seller(xml)
        assert seller.find("ram:ID", NS) is None
        assert [c.tag.split("}")[1] for c in seller][0] == "Name"

    def test_reverse_charge_intra_eu_emits_category_k(self, payloads):
        payload = payloads("05-reverse-charge.json")
        payload["invoice"]["reverseChargeType"] = "intra_eu"
        xml = render_zugferd_xml(payload)
        assert "<ram:CategoryCode>K</ram:CategoryCode>" in xml
        assert "<ram:CategoryCode>S</ram:CategoryCode>" not in xml
        assert "VAT exempt for EEA intra-community supply" in xml

    def test_reverse_charge_third_country_emits_category_g(self, payloads):
        payload = payloads("05-reverse-charge.json")
        payload["invoice"]["reverseChargeType"] = "third_country"
        xml = render_zugferd_xml(payload)
        assert "<ram:CategoryCode>G</ram:CategoryCode>" in xml
        assert "<ram:CategoryCode>S</ram:CategoryCode>" not in xml
        assert "Export outside EU" in xml

    @pytest.mark.parametrize("profile,urn", [
        ("basic", "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic"),
        ("en16931", "urn:cen.eu:en16931:2017"),
        ("extended", "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended"),
        ("EXTENDED", "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended"),
        ("unknown", "urn:cen.eu:en16931:2017"),
    ])
    def test_profile_urn_is_exact(self, payloads, profile, urn):
        payload = payloads("01-standard-19.json")
        payload["profile"] = profile
        xml = render_zugferd_xml(payload)
        assert _xpath_text(xml, ".//ram:GuidelineSpecifiedDocumentContextParameter/ram:ID") == urn

    def test_default_profile_is_en16931(self, payloads):
        payload = payloads("01-standard-19.json")
        del payload["profile"]
        xml = render_zugferd_xml(payload)
        assert _xpath_text(xml, ".//ram:GuidelineSpecifiedDocumentContextParameter/ram:ID") == "urn:cen.eu:en16931:2017"

    def test_credit_note_renders_negative_amounts(self, payloads):
        payload = payloads("01-standard-19.json")
        payload["invoice"].update(isCreditNote=True, subtotal=-120000, vatAmount=-22800, total=-142800)
        xml = render_zugferd_xml(payload)
        assert _xpath_text(xml, ".//rsm:ExchangedDocument/ram:TypeCode") == "381"
        assert _xpath_text(xml, ".//ram:IncludedSupplyChainTradeLineItem//ram:LineTotalAmount") == "-1200.00"
        tax = _xpath_all(xml, ".//ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax")
        assert [t.find("ram:BasisAmount", NS).text for t in tax] == ["-1200.00"]
        assert [t.find("ram:CalculatedAmount", NS).text for t in tax] == ["-228.00"]
        summation = ".//ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:"
        assert _xpath_text(xml, summation + "GrandTotalAmount") == "-1428.00"

    def test_credit_note_flag_invertsvat_groups(self):
        groups = vat_groups([{"lineTotal": 120000, "vatRate": 19}], is_klein=False, sign=-1)
        assert groups == [{"rate": 19.0, "basis": -120000, "tax": -22800}]


class TestVatGrouping:
    def test_groups_by_rate(self):
        items = [
            {"lineTotal": 10000, "vatRate": 19},
            {"lineTotal": 5000, "vatRate": 7},
            {"lineTotal": 2000, "vatRate": 19},
        ]
        groups = vat_groups(items, is_klein=False)
        assert len(groups) == 2
        rate_19 = next(g for g in groups if g["rate"] == 19)
        rate_7 = next(g for g in groups if g["rate"] == 7)
        assert rate_19["basis"] == 12000
        assert rate_19["tax"] == round(12000 * 0.19)
        assert rate_7["basis"] == 5000
        assert rate_7["tax"] == round(5000 * 0.07)

    def test_kleinunternehmer_zeros_vat(self):
        items = [{"lineTotal": 10000, "vatRate": 19}]
        groups = vat_groups(items, is_klein=True)
        assert len(groups) == 1
        assert groups[0]["rate"] == 0
        assert groups[0]["tax"] == 0
        assert groups[0]["basis"] == 10000

    def test_empty_items_returns_zero_group(self):
        groups = vat_groups([], is_klein=False)
        assert len(groups) == 1
        assert groups[0]["basis"] == 0

    def test_sorted_ascending_by_rate(self):
        items = [
            {"lineTotal": 1000, "vatRate": 19},
            {"lineTotal": 1000, "vatRate": 7},
            {"lineTotal": 1000, "vatRate": 0},
        ]
        groups = vat_groups(items, is_klein=False)
        assert [g["rate"] for g in groups] == [0, 7, 19]

    def test_half_cent_tax_rounds_up_like_the_app(self):
        # 150 ct * 19 % = 28.5 ct; the app (Math.round) books 29, banker's rounding gives 28.
        groups = vat_groups([{"lineTotal": 150, "vatRate": 19}], is_klein=False)
        assert groups[0]["tax"] == 29

    def test_credit_note_tax_mirrors_the_invoice_tax(self):
        groups = vat_groups([{"lineTotal": 150, "vatRate": 19}], is_klein=False, sign=-1)
        assert (groups[0]["basis"], groups[0]["tax"]) == (-150, -29)


def _local_names(elements: list[ET.Element]) -> list[str]:
    return [el.tag.rsplit("}", 1)[1] for el in elements]


AGREEMENT = "rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/"
SETTLEMENT = "rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/"
FIRST_LINE = "rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem/"


class TestBuyerReference:
    def test_zugferd_emits_buyer_reference_before_seller(self, payloads):
        payload = payloads("01-standard-19.json")
        payload["invoice"]["buyerReference"] = "04011000-1234512345-35"
        xml = render_zugferd_xml(payload)
        assert _local_names(_xpath_all(xml, AGREEMENT + "*"))[:2] == ["BuyerReference", "SellerTradeParty"]
        assert _xpath_text(xml, AGREEMENT + "ram:BuyerReference") == "04011000-1234512345-35"

    def test_zugferd_omits_buyer_reference_without_value(self, payloads):
        assert "BuyerReference" not in render_zugferd_xml(payloads("01-standard-19.json"))


class TestXRechnungSemantics:
    def test_guideline_and_business_process(self, payloads):
        xml = render_xrechnung_xml(payloads("08-xrechnung-standard-19.json"))
        context = "rsm:ExchangedDocumentContext/"
        assert _xpath_text(xml, context + "ram:GuidelineSpecifiedDocumentContextParameter/ram:ID") == XRECHNUNG_GUIDELINE_URN
        assert _xpath_text(xml, context + "ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID")

    def test_seller_contact_precedes_address_and_carries_person_phone_email(self, payloads):
        xml = render_xrechnung_xml(payloads("08-xrechnung-standard-19.json"))
        seller = AGREEMENT + "ram:SellerTradeParty/"
        children = _local_names(_xpath_all(xml, seller + "*"))
        assert children.index("DefinedTradeContact") < children.index("PostalTradeAddress")
        contact = seller + "ram:DefinedTradeContact/"
        assert _xpath_text(xml, contact + "ram:PersonName") == "Jonas Laux"
        assert _xpath_text(xml, contact + "ram:TelephoneUniversalCommunication/ram:CompleteNumber") == "+49 30 1234567"
        assert _xpath_text(xml, contact + "ram:EmailURIUniversalCommunication/ram:URIID") == "rechnung@laux.digital"

    def test_electronic_addresses_for_both_parties(self, payloads):
        xml = render_xrechnung_xml(payloads("08-xrechnung-standard-19.json"))
        assert _xpath_text(xml, AGREEMENT + "ram:SellerTradeParty/ram:URIUniversalCommunication/ram:URIID") == "rechnung@laux.digital"
        assert _xpath_text(xml, AGREEMENT + "ram:BuyerTradeParty/ram:URIUniversalCommunication/ram:URIID") == "eingangsrechnung@bfb.example.de"

    def test_buyer_reference_is_the_leitweg_id(self, payloads):
        xml = render_xrechnung_xml(payloads("08-xrechnung-standard-19.json"))
        assert _xpath_text(xml, AGREEMENT + "ram:BuyerReference") == "04011000-1234512345-35"

    def test_storno_is_credit_note_with_negative_quantity_and_totals(self, payloads):
        xml = render_xrechnung_xml(payloads("09-xrechnung-storno.json"))
        assert _xpath_text(xml, "rsm:ExchangedDocument/ram:TypeCode") == "381"
        assert _xpath_text(xml, FIRST_LINE + "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity") == "-10"
        line_total = FIRST_LINE + "ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount"
        assert _xpath_text(xml, line_total) == "-1200.00"
        grand_total = SETTLEMENT + "ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:GrandTotalAmount"
        assert _xpath_text(xml, grand_total) == "-1428.00"
        assert _xpath_text(xml, SETTLEMENT + "ram:InvoiceReferencedDocument/ram:IssuerAssignedID") == "RE-2026-XR-01"

    def test_zugferd_credit_note_keeps_positive_quantity(self, payloads):
        xml = render_zugferd_xml(payloads("09-xrechnung-storno.json"))
        assert _xpath_text(xml, FIRST_LINE + "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity") == "10"

    def test_reverse_charge_uses_category_k_and_deliver_to_address(self, payloads):
        xml = render_xrechnung_xml(payloads("10-xrechnung-reverse-charge.json"))
        assert "<ram:CategoryCode>K</ram:CategoryCode>" in xml
        ship_to = "rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:PostalTradeAddress/"
        assert _xpath_text(xml, ship_to + "ram:CityName") == "Amsterdam"
        assert _xpath_text(xml, ship_to + "ram:PostcodeCode") == "1015 BG"

    def test_no_deliver_to_party_unless_intra_eu(self, payloads):
        xml = render_xrechnung_xml(payloads("08-xrechnung-standard-19.json"))
        assert "ShipToTradeParty" not in xml

    def test_zugferd_keeps_the_deliver_to_country(self, payloads):
        xml = render_zugferd_xml(payloads("08-xrechnung-standard-19.json"))
        ship_to = "rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ShipToTradeParty/ram:PostalTradeAddress/"
        assert _xpath_text(xml, ship_to + "ram:CountryID") == "DE"

    def test_kleinunternehmer_uses_the_tax_number_as_seller_id_and_category_e(self, payloads):
        xml = render_xrechnung_xml(payloads("12-xrechnung-kleinunternehmer.json"))
        assert _xpath_text(xml, AGREEMENT + "ram:SellerTradeParty/ram:ID") == "12/345/67890"
        assert "<ram:CategoryCode>E</ram:CategoryCode>" in xml
        assert "SpecifiedTaxRegistration" in xml and 'schemeID="VA"' not in xml

    def test_skonto_line_follows_the_payment_terms_text(self, payloads):
        xml = render_xrechnung_xml(payloads("11-xrechnung-skonto.json"))
        assert _xpath_text(xml, SETTLEMENT + "ram:SpecifiedTradePaymentTerms/ram:Description") == (
            "Zahlbar innerhalb von 14 Tagen ohne Abzug.\n#SKONTO#TAGE=10#PROZENT=2.00#\n"
        )
        assert "ApplicableTradePaymentDiscountTerms" not in xml

    def test_zugferd_has_no_xrechnung_additions(self, payloads):
        xml = render_zugferd_xml(payloads("01-standard-19.json"))
        for xrechnung_only in (
            "DefinedTradeContact",
            "BusinessProcessSpecifiedDocumentContextParameter",
            "URIUniversalCommunication",
        ):
            assert xrechnung_only not in xml


PAYLOAD_NAMES = sorted(p.name for p in (Path(__file__).parent.parent / "test-payloads").glob("*.json"))
SKONTO = {"skontoPercent": 2, "skontoDays": 7, "skontoAmountCent": 583, "skontoDeadline": 1748044800}


class TestProfileSchemas:
    """Every profile must stay within its official Factur-X XSD: receivers that
    check the schema reject the whole e-invoice for one foreign element."""

    @pytest.mark.parametrize("with_skonto", [False, True], ids=["plain", "skonto"])
    @pytest.mark.parametrize("profile", ["basic", "en16931", "extended"])
    @pytest.mark.parametrize("name", PAYLOAD_NAMES)
    def test_xml_is_valid_against_the_profile_xsd(self, payloads, name, profile, with_skonto):
        payload = payloads(name)
        payload["profile"] = profile
        if with_skonto:
            payload["invoice"].update(SKONTO)

        xml_check_xsd(render_zugferd_xml(payload).encode("utf-8"), flavor="factur-x", level=profile)

    @pytest.mark.parametrize("profile", ["basic", "en16931"])
    def test_skonto_outside_extended_is_a_description_line(self, payloads, profile):
        payload = payloads("01-standard-19.json")
        payload["profile"] = profile
        payload["invoice"].update(SKONTO)

        xml = render_zugferd_xml(payload)

        assert "ApplicableTradePaymentDiscountTerms" not in xml
        assert "#SKONTO#TAGE=7#PROZENT=2.00#" in xml

    def test_extended_carries_structured_skonto(self, payloads):
        payload = payloads("01-standard-19.json")
        payload["profile"] = "extended"
        payload["invoice"].update(SKONTO)

        xml = render_zugferd_xml(payload)

        assert "<ram:CalculationPercent>2.00</ram:CalculationPercent>" in xml
        assert "#SKONTO#" not in xml
