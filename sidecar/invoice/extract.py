"""
Extract structured data from an incoming ZUGFeRD/Factur-X PDF.

Reads the embedded `factur-x.xml` (or legacy `zugferd-invoice.xml`) attachment
via `facturx.get_xml_from_pdf`, parses the CII XML with lxml, and maps the
fields onto Zettel's expense data model.

All monetary amounts in the XML are decimal strings (e.g. "123.45"). We round
to cents (integers). All dates are `format="102"` (YYYYMMDD) and converted to
local-midnight Unix seconds.

Defensive throughout — incoming invoices come from foreign tools and may use
BASIC / EN16931 / EXTENDED with varying optional fields filled.
"""
from __future__ import annotations

import datetime as _dt
from pathlib import Path
from typing import Any

from lxml import etree

# Namespaces used by all CII-flavored ZUGFeRD profiles.
NS = {
    "rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
    "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
    "qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
}


def _text(node, xpath: str, default: str | None = None) -> str | None:
    if node is None:
        return default
    found = node.xpath(xpath, namespaces=NS)
    if not found:
        return default
    val = found[0]
    if hasattr(val, "text"):
        val = val.text
    if val is None:
        return default
    return str(val).strip()


def _cents(node, xpath: str) -> int:
    s = _text(node, xpath)
    if not s:
        return 0
    try:
        return round(float(s.replace(",", ".")) * 100)
    except (ValueError, TypeError):
        return 0


def _yyyymmdd_to_unix(s: str | None) -> int | None:
    if not s or len(s) != 8:
        return None
    try:
        d = _dt.date(int(s[0:4]), int(s[4:6]), int(s[6:8]))
        return int(_dt.datetime(d.year, d.month, d.day).timestamp())
    except (ValueError, TypeError):
        return None


def _parse_party(node) -> dict[str, Any]:
    if node is None:
        return {}
    return {
        "name": _text(node, "ram:Name"),
        "street": _text(node, "ram:PostalTradeAddress/ram:LineOne") or "",
        "postalCode": _text(node, "ram:PostalTradeAddress/ram:PostcodeCode") or "",
        "city": _text(node, "ram:PostalTradeAddress/ram:CityName") or "",
        "country": _text(node, "ram:PostalTradeAddress/ram:CountryID") or "DE",
        "vatId": _text(node, 'ram:SpecifiedTaxRegistration/ram:ID[@schemeID="VA"]'),
        "taxNumber": _text(node, 'ram:SpecifiedTaxRegistration/ram:ID[@schemeID="FC"]'),
        "email": _text(node, "ram:URIUniversalCommunication/ram:URIID"),
    }


def _parse_line(line) -> dict[str, Any]:
    description = _text(line, "ram:SpecifiedTradeProduct/ram:Name") or ""
    quantity_str = _text(
        line,
        "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity",
        default="1",
    )
    try:
        quantity = float((quantity_str or "1").replace(",", "."))
    except (ValueError, TypeError):
        quantity = 1.0
    unit = (
        line.xpath(
            "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity/@unitCode",
            namespaces=NS,
        )
        or ["C62"]
    )[0]
    unit_price = _cents(
        line,
        "ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:ChargeAmount",
    )
    line_total = _cents(
        line,
        "ram:SpecifiedLineTradeSettlement/"
        "ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount",
    )
    vat_rate_str = _text(
        line,
        "ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:RateApplicablePercent",
        default="0",
    )
    try:
        vat_rate = round(float((vat_rate_str or "0").replace(",", ".")))
    except (ValueError, TypeError):
        vat_rate = 0
    category = _text(
        line,
        "ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode",
    )
    return {
        "description": description,
        "quantity": quantity,
        "unit": _unece_to_label(unit),
        "unitPrice": unit_price,
        "vatRate": vat_rate,
        "lineTotal": line_total,
        "categoryCode": category,
    }


# Subset of UN/ECE Rec. 20 codes commonly seen in ZUGFeRD line items.
# Anything we don't know maps to the literal code so the user can still see it.
_UNECE_LABELS = {
    "C62": "Stk",
    "H87": "Stk",
    "HUR": "h",
    "DAY": "Tag",
    "MTR": "m",
    "KGM": "kg",
    "LS": "Pauschal",
    "ZZ": "Pauschal",
}


def _unece_to_label(code: str) -> str:
    return _UNECE_LABELS.get(code, code or "Stk")


def extract_from_pdf(pdf_path: str) -> dict[str, Any]:
    """Top-level extract. Returns `{found: bool, profile?, data?}`."""
    import facturx  # imported lazily so other commands don't pay the cost

    path = Path(pdf_path)
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    pdf_bytes = path.read_bytes()
    xml_filename, xml_bytes = facturx.get_xml_from_pdf(pdf_bytes)
    if not xml_bytes:
        return {"found": False}

    root = etree.fromstring(xml_bytes)
    return {
        "found": True,
        "profile": _detect_profile(root),
        "xmlFilename": xml_filename,
        "data": _map_invoice(root),
    }


def _detect_profile(root) -> str:
    urn = _text(
        root,
        "rsm:ExchangedDocumentContext/"
        "ram:GuidelineSpecifiedDocumentContextParameter/ram:ID",
        default="",
    ) or ""
    urn_lower = urn.lower()
    if "extended" in urn_lower:
        return "extended"
    if "basic" in urn_lower and "wl" not in urn_lower:
        return "basic"
    if "minimum" in urn_lower:
        return "minimum"
    return "en16931"


def _map_invoice(root) -> dict[str, Any]:
    doc = root.find("rsm:ExchangedDocument", NS)
    txn = root.find("rsm:SupplyChainTradeTransaction", NS)
    agreement = (
        txn.find("ram:ApplicableHeaderTradeAgreement", NS) if txn is not None else None
    )
    delivery = (
        txn.find("ram:ApplicableHeaderTradeDelivery", NS) if txn is not None else None
    )
    settlement = (
        txn.find("ram:ApplicableHeaderTradeSettlement", NS) if txn is not None else None
    )

    invoice_number = _text(doc, "ram:ID")
    type_code = _text(doc, "ram:TypeCode") or "380"
    issue_date = _yyyymmdd_to_unix(
        _text(doc, "ram:IssueDateTime/udt:DateTimeString")
    )
    due_date = _yyyymmdd_to_unix(
        _text(
            settlement,
            "ram:SpecifiedTradePaymentTerms/ram:DueDateDateTime/udt:DateTimeString",
        )
    )
    delivery_date = _yyyymmdd_to_unix(
        _text(
            delivery,
            "ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString",
        )
    )
    currency = _text(settlement, "ram:InvoiceCurrencyCode") or "EUR"

    seller = _parse_party(
        agreement.find("ram:SellerTradeParty", NS) if agreement is not None else None
    )
    buyer = _parse_party(
        agreement.find("ram:BuyerTradeParty", NS) if agreement is not None else None
    )

    line_nodes = (
        txn.findall("ram:IncludedSupplyChainTradeLineItem", NS) if txn is not None else []
    )
    line_items = [_parse_line(n) for n in line_nodes]

    summary = (
        settlement.find("ram:SpecifiedTradeSettlementHeaderMonetarySummation", NS)
        if settlement is not None
        else None
    )
    subtotal = _cents(summary, "ram:LineTotalAmount")
    vat_total = _cents(summary, "ram:TaxTotalAmount")
    grand_total = _cents(summary, "ram:GrandTotalAmount")

    # Reverse-charge heuristic: any document-level ApplicableTradeTax with
    # CategoryCode in {K, AE, G} signals reverse charge.
    rc_type = "none"
    if settlement is not None:
        for tax in settlement.findall("ram:ApplicableTradeTax", NS):
            cc = _text(tax, "ram:CategoryCode")
            if cc == "K" or cc == "AE":
                rc_type = "intra_eu"
                break
            if cc == "G":
                rc_type = "third_country"
                break

    return {
        "invoiceNumber": invoice_number,
        "typeCode": type_code,
        "isCreditNote": type_code == "381",
        "issueDate": issue_date,
        "dueDate": due_date,
        "deliveryDate": delivery_date,
        "currency": currency,
        "reverseChargeType": rc_type,
        "seller": seller,
        "buyer": buyer,
        "lineItems": line_items,
        "totals": {
            "subtotal": subtotal,
            "vatAmount": vat_total,
            "total": grand_total,
        },
    }
