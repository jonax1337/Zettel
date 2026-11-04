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

DEFAULT_UNIT_CODE = "C62"
COMMERCIAL_INVOICE_TYPE_CODE = "380"
CREDIT_NOTE_TYPE_CODE = "381"
INTRA_EU_REVERSE_CHARGE_CATEGORIES = ("K", "AE")
THIRD_COUNTRY_CATEGORY = "G"

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


def _number(raw: str | None, default: float) -> float:
    """Parse a decimal string (comma or dot separator); `default` if unparsable."""
    if not raw:
        return default
    try:
        return float(raw.replace(",", "."))
    except ValueError:
        return default


def _cents(node, xpath: str) -> int:
    return round(_number(_text(node, xpath), 0.0) * 100)


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
    quantity = _number(
        _text(line, "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity"),
        default=1.0,
    )
    unit = (
        line.xpath(
            "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity/@unitCode",
            namespaces=NS,
        )
        or [DEFAULT_UNIT_CODE]
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
    vat_rate = round(
        _number(
            _text(
                line,
                "ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:RateApplicablePercent",
            ),
            default=0.0,
        )
    )
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
    return _UNECE_LABELS.get(code, code or _UNECE_LABELS[DEFAULT_UNIT_CODE])


def _read_embedded_xml(pdf_path: str) -> tuple[str | None, bytes | None]:
    """Embedded Factur-X attachment of a PDF as (filename, bytes), or (None, None)."""
    import facturx  # imported lazily so other commands don't pay the cost

    path = Path(pdf_path)
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    return facturx.get_xml_from_pdf(path.read_bytes(), check_schematron=False)


def extract_xml_only(pdf_path: str) -> dict[str, Any]:
    """Raw embedded XML for the validator. Returns `{found: bool, xmlFilename?, xml?}`."""
    xml_filename, xml_bytes = _read_embedded_xml(pdf_path)
    if not xml_bytes:
        return {"found": False}
    return {"found": True, "xmlFilename": xml_filename, "xml": xml_bytes.decode("utf-8")}


def extract_from_pdf(pdf_path: str) -> dict[str, Any]:
    """Top-level extract. Returns `{found: bool, profile?, data?}`."""
    xml_filename, xml_bytes = _read_embedded_xml(pdf_path)
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


def _child(parent, path: str):
    return parent.find(path, NS) if parent is not None else None


def _detect_reverse_charge(settlement) -> str:
    """Any document-level ApplicableTradeTax with CategoryCode K/AE (intra-EU)
    or G (third country) signals reverse charge."""
    if settlement is None:
        return "none"
    for tax in settlement.findall("ram:ApplicableTradeTax", NS):
        category = _text(tax, "ram:CategoryCode")
        if category in INTRA_EU_REVERSE_CHARGE_CATEGORIES:
            return "intra_eu"
        if category == THIRD_COUNTRY_CATEGORY:
            return "third_country"
    return "none"


def _map_invoice(root) -> dict[str, Any]:
    doc = root.find("rsm:ExchangedDocument", NS)
    txn = root.find("rsm:SupplyChainTradeTransaction", NS)
    agreement = _child(txn, "ram:ApplicableHeaderTradeAgreement")
    delivery = _child(txn, "ram:ApplicableHeaderTradeDelivery")
    settlement = _child(txn, "ram:ApplicableHeaderTradeSettlement")

    invoice_number = _text(doc, "ram:ID")
    type_code = _text(doc, "ram:TypeCode") or COMMERCIAL_INVOICE_TYPE_CODE
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

    line_nodes = txn.findall("ram:IncludedSupplyChainTradeLineItem", NS) if txn is not None else []
    summary = _child(settlement, "ram:SpecifiedTradeSettlementHeaderMonetarySummation")

    return {
        "invoiceNumber": invoice_number,
        "typeCode": type_code,
        "isCreditNote": type_code == CREDIT_NOTE_TYPE_CODE,
        "issueDate": issue_date,
        "dueDate": due_date,
        "deliveryDate": delivery_date,
        "currency": currency,
        "reverseChargeType": _detect_reverse_charge(settlement),
        "seller": _parse_party(_child(agreement, "ram:SellerTradeParty")),
        "buyer": _parse_party(_child(agreement, "ram:BuyerTradeParty")),
        "lineItems": [_parse_line(n) for n in line_nodes],
        "totals": {
            "subtotal": _cents(summary, "ram:LineTotalAmount"),
            "vatAmount": _cents(summary, "ram:TaxTotalAmount"),
            "total": _cents(summary, "ram:GrandTotalAmount"),
        },
    }
