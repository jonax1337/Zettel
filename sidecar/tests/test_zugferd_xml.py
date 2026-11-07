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

from invoice.vat import vat_groups
from invoice.zugferd import render_zugferd_xml

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


class TestZugferdGoldens:
    # The 05 fixture only carries isReverseCharge; the template keys on reverseChargeType.
    @pytest.mark.parametrize("golden_name,payload_name,reverse_charge_type", [
        ("01-standard-19", "01-standard-19.json", None),
        ("02-mixed-vat", "02-mixed-vat.json", None),
        ("03-five-positions", "03-five-positions.json", None),
        ("04-ku-with-vatid", "04-ku-with-vatid.json", None),
        ("05-reverse-charge", "05-reverse-charge.json", "intra_eu"),
        ("05-reverse-charge-third-country", "05-reverse-charge.json", "third_country"),
        ("06-basic", "06-basic.json", None),
        ("07-extended", "07-extended.json", None),
    ])
    def test_xml_matches_golden(self, payloads, golden_name, payload_name, reverse_charge_type, request):
        payload = payloads(payload_name)
        if reverse_charge_type:
            payload["invoice"]["reverseChargeType"] = reverse_charge_type
        xml = render_zugferd_xml(payload)

        golden = GOLDEN_DIR / f"{golden_name}.xml"
        if request.config.getoption("--record", default=False) or not golden.exists():
            golden.write_text(xml, encoding="utf-8")
            pytest.skip(f"recorded golden: {golden.name}")

        expected = golden.read_text(encoding="utf-8")
        assert _normalize(xml) == _normalize(expected), (
            f"XML drift in {golden_name}. "
            f"If intentional, re-record with: pytest --record"
        )


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
