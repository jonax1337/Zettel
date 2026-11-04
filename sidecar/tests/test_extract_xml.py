"""Mapping of an incoming Factur-X invoice onto expense data (invoice/extract.py)."""
from __future__ import annotations

from lxml import etree

from invoice.extract import _map_invoice

_HEADER = """<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument><ram:ID>R-1</ram:ID><ram:TypeCode>380</ram:TypeCode></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>"""

_FOOTER = """
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>"""


def _line(*, name="Strom", charge="0.3249", basis_quantity=None, quantity="1000", unit="KWH",
          line_total="324.90", rate="19") -> str:
    basis = f'<ram:BasisQuantity unitCode="{unit}">{basis_quantity}</ram:BasisQuantity>' if basis_quantity else ""
    total = f"<ram:LineTotalAmount>{line_total}</ram:LineTotalAmount>" if line_total is not None else ""
    return f"""
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:SpecifiedTradeProduct><ram:Name>{name}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>{charge}</ram:ChargeAmount>{basis}</ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="{unit}">{quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>{rate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>{total}</ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>"""


def _settlement(*, groups=(("19", "324.90", "61.73"),), net="324.90", vat="61.73", total="386.63", lines=None) -> str:
    taxes = "".join(
        f"<ram:ApplicableTradeTax><ram:CalculatedAmount>{tax}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>"
        f"<ram:BasisAmount>{basis}</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode>"
        f"<ram:RateApplicablePercent>{rate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>"
        for rate, basis, tax in groups
    )
    return f"""
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      {taxes}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>{lines or net}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>{net}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount>{vat}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>{total}</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>"""


def _mapped(lines: str, settlement: str | None = None) -> dict:
    xml = _HEADER + lines + (settlement if settlement is not None else _settlement()) + _FOOTER
    return _map_invoice(etree.fromstring(xml.encode("utf-8")))


def test_line_total_comes_from_the_xml_not_from_the_rounded_unit_price():
    # 1000 kWh x 0.3249 EUR: the cent-rounded price (0.32) would give 320.00.
    line = _mapped(_line())["lineItems"][0]

    assert line["lineTotal"] == 32490
    assert line["unitPrice"] == 32
    assert line["unitPriceDecimal"] == "0.3249"
    assert line["quantity"] == 1000


def test_price_per_basis_quantity_is_divided_down_to_one_unit():
    # 5.00 EUR per 100 pieces = 0.05 EUR each.
    line = _mapped(_line(charge="5.00", basis_quantity="100", unit="C62", quantity="300", line_total="15.00"))["lineItems"][0]

    assert line["unitPrice"] == 5
    assert line["unitPriceDecimal"] == "0.05"
    assert line["lineTotal"] == 1500


def test_line_allowance_stays_inside_the_stated_line_total():
    # 10 x 20.00 with a 15.00 line discount, supplier states 185.00.
    line = _mapped(_line(charge="20.00", quantity="10", unit="C62", line_total="185.00"))["lineItems"][0]

    assert line["lineTotal"] == 18500


def test_missing_line_total_falls_back_to_quantity_times_price():
    line = _mapped(_line(charge="12.50", quantity="2", unit="C62", line_total=None))["lineItems"][0]

    assert line["lineTotal"] == 2500


def test_amounts_round_half_up_to_cents():
    line = _mapped(_line(charge="0.125", quantity="1", unit="C62", line_total="0.125"))["lineItems"][0]

    assert line["lineTotal"] == 13


def test_header_totals_and_tax_groups_are_exposed():
    data = _mapped(
        _line(line_total="100.00", charge="100.00", quantity="1", unit="C62")
        + _line(name="Buch", line_total="50.00", charge="50.00", quantity="1", unit="C62", rate="7"),
        _settlement(groups=(("7", "50.00", "3.50"), ("19", "100.00", "19.00")), net="150.00", vat="22.50", total="172.50"),
    )

    assert data["totals"]["net"] == 15000
    assert data["totals"]["vatAmount"] == 2250
    assert data["taxGroups"] == [
        {"vatRate": 7, "basis": 5000, "tax": 350, "categoryCode": "S"},
        {"vatRate": 19, "basis": 10000, "tax": 1900, "categoryCode": "S"},
    ]


def test_document_level_allowance_shows_up_in_the_tax_basis():
    # 100.00 line minus a 10.00 document allowance: the VAT group is on 90.00.
    data = _mapped(
        _line(line_total="100.00", charge="100.00", quantity="1", unit="C62"),
        _settlement(groups=(("19", "90.00", "17.10"),), net="90.00", vat="17.10", total="107.10", lines="100.00"),
    )

    assert data["totals"]["subtotal"] == 10000
    assert data["totals"]["net"] == 9000
    assert data["taxGroups"][0]["basis"] == 9000
