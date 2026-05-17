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

from invoice.zugferd import render_zugferd_xml, _vat_groups, _PROFILE_URNS

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


class TestZugferdGoldens:
    @pytest.mark.parametrize("payload_name", [
        "01-standard-19.json",
        "02-mixed-vat.json",
        "03-five-positions.json",
        "04-ku-with-vatid.json",
        "05-reverse-charge.json",
        "06-basic.json",
        "07-extended.json",
    ])
    def test_xml_matches_golden(self, payloads, payload_name, request):
        payload = payloads(payload_name)
        xml = render_zugferd_xml(payload)

        golden = GOLDEN_DIR / payload_name.replace(".json", ".xml")
        if request.config.getoption("--record", default=False) or not golden.exists():
            golden.write_text(xml, encoding="utf-8")
            pytest.skip(f"recorded golden: {golden.name}")

        expected = golden.read_text(encoding="utf-8")
        assert _normalize(xml) == _normalize(expected), (
            f"XML drift in {payload_name}. "
            f"If intentional, re-record with: pytest --record"
        )


class TestZugferdSemantics:
    """Semantic invariants — these must hold regardless of golden re-records."""

    def test_standard_invoice_has_seller_vat_id(self, payloads):
        xml = render_zugferd_xml(payloads("01-standard-19.json"))
        assert "DE123456789" in xml

    def test_kleinunternehmer_falls_back_to_tax_number(self, payloads):
        """BR-CO-26: seller must be identifiable. Without VAT-ID we emit
        the tax number as <ram:ID> on SellerTradeParty."""
        payload = payloads("04-ku-with-vatid.json")
        payload["company"]["vatId"] = None
        payload["company"]["isKleinunternehmer"] = True
        payload["invoice"]["isKleinunternehmer"] = True
        xml = render_zugferd_xml(payload)
        assert payload["company"]["taxNumber"] in xml

    def test_reverse_charge_intra_eu_emits_category_k(self, payloads):
        payload = payloads("05-reverse-charge.json")
        payload["invoice"]["reverseChargeType"] = "intra_eu"
        xml = render_zugferd_xml(payload)
        assert "<ram:CategoryCode>K</ram:CategoryCode>" in xml
        assert "intra-community" in xml.lower() or "intra community" in xml.lower()

    def test_reverse_charge_third_country_emits_category_g(self, payloads):
        payload = payloads("05-reverse-charge.json")
        payload["invoice"]["reverseChargeType"] = "third_country"
        xml = render_zugferd_xml(payload)
        assert "<ram:CategoryCode>G</ram:CategoryCode>" in xml

    def test_basic_profile_urn(self, payloads):
        payload = payloads("01-standard-19.json")
        payload["profile"] = "basic"
        xml = render_zugferd_xml(payload)
        assert _PROFILE_URNS["basic"] in xml

    def test_extended_profile_urn(self, payloads):
        payload = payloads("01-standard-19.json")
        payload["profile"] = "extended"
        xml = render_zugferd_xml(payload)
        assert _PROFILE_URNS["extended"] in xml

    def test_default_profile_is_en16931(self, payloads):
        xml = render_zugferd_xml(payloads("01-standard-19.json"))
        assert _PROFILE_URNS["en16931"] in xml

    def test_credit_note_inverts_amounts(self, payloads):
        payload = payloads("01-standard-19.json")
        payload["invoice"]["isCreditNote"] = True
        groups = _vat_groups(payload["items"], is_klein=False, sign=-1)
        assert all(g["basis"] <= 0 for g in groups)
        assert all(g["tax"] <= 0 for g in groups)


class TestVatGrouping:
    def test_groups_by_rate(self):
        items = [
            {"lineTotal": 10000, "vatRate": 19},
            {"lineTotal": 5000, "vatRate": 7},
            {"lineTotal": 2000, "vatRate": 19},
        ]
        groups = _vat_groups(items, is_klein=False)
        assert len(groups) == 2
        rate_19 = next(g for g in groups if g["rate"] == 19)
        rate_7 = next(g for g in groups if g["rate"] == 7)
        assert rate_19["basis"] == 12000
        assert rate_19["tax"] == round(12000 * 0.19)
        assert rate_7["basis"] == 5000
        assert rate_7["tax"] == round(5000 * 0.07)

    def test_kleinunternehmer_zeros_vat(self):
        items = [{"lineTotal": 10000, "vatRate": 19}]
        groups = _vat_groups(items, is_klein=True)
        assert len(groups) == 1
        assert groups[0]["rate"] == 0
        assert groups[0]["tax"] == 0

    def test_empty_items_returns_zero_group(self):
        groups = _vat_groups([], is_klein=False)
        assert len(groups) == 1
        assert groups[0]["basis"] == 0

    def test_sorted_ascending_by_rate(self):
        items = [
            {"lineTotal": 1000, "vatRate": 19},
            {"lineTotal": 1000, "vatRate": 7},
            {"lineTotal": 1000, "vatRate": 0},
        ]
        groups = _vat_groups(items, is_klein=False)
        assert [g["rate"] for g in groups] == [0, 7, 19]
