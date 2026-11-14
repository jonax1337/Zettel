"""EPC-QR-Code (Girocode) generator for SEPA-credit-transfer invoices.

Spec: EPC069-12 v3.0 — "Quick Response Code: Guidelines to enable data capture
for the initiation of a SEPA Credit Transfer". The QR payload is a fixed-order
text block of newline-separated fields:

    BCD                                  service tag
    002                                  version (002 = with-BIC optional)
    1                                    character set (1 = UTF-8)
    SCT                                  identification (SEPA Credit Transfer)
    <BIC>                                optional in v2
    <BeneficiaryName>                    max 70 chars
    <IBAN>                               beneficiary IBAN, no spaces
    EUR<amount>                          e.g. EUR12.34
    <Purpose>                            optional, 4-letter code
    <Reference>                          structured (RF) creditor reference
    <Remittance>                         unstructured remittance, max 140

Only EUR is supported by the spec — non-EUR invoices simply skip the QR.
"""
from __future__ import annotations

import base64
import io
from decimal import Decimal
from typing import Any

from .vat import open_balance_cent

SERVICE_TAG = "BCD"
VERSION = "002"
CHARSET_UTF8 = "1"
SEPA_CREDIT_TRANSFER = "SCT"
MAX_NAME_LENGTH = 70
MAX_REMITTANCE_LENGTH = 140
CENTS_PER_EUR = 100


def _clean_iban(iban: str) -> str:
    return "".join(ch for ch in iban if ch.isalnum()).upper()


def _clean_bic(bic: str | None) -> str:
    if not bic:
        return ""
    return "".join(ch for ch in bic if ch.isalnum()).upper()


def _format_amount(amount_cent: int) -> str:
    # EPC requires "EUR" + amount with dot as decimal separator, 0.01..999_999_999.99.
    eur = Decimal(amount_cent) / CENTS_PER_EUR
    return f"EUR{eur:.2f}"


def build_epc_payload(
    *,
    beneficiary_name: str,
    iban: str,
    amount_cent: int,
    bic: str | None = None,
    remittance: str = "",
) -> str:
    """Build the EPC payload string. Caller validates business inputs."""
    # Truncate per spec to keep total payload <= 331 bytes (we're well under).
    name = beneficiary_name.strip()[:MAX_NAME_LENGTH]
    remit = remittance.strip()[:MAX_REMITTANCE_LENGTH]
    fields = [
        SERVICE_TAG,
        VERSION,
        CHARSET_UTF8,
        SEPA_CREDIT_TRANSFER,
        _clean_bic(bic),
        name,
        _clean_iban(iban),
        _format_amount(amount_cent),
        "",       # purpose code, unused
        "",       # structured creditor reference, unused
        remit,    # unstructured remittance
    ]
    # Trim trailing empty fields per the spec to reduce QR density.
    while fields and fields[-1] == "":
        fields.pop()
    return "\n".join(fields)


def should_emit_qr(
    *,
    currency: str | None,
    iban: str | None,
    amount_cent: int,
    is_credit_note: bool,
) -> bool:
    """Trigger logic for EPC-QR — EUR only, IBAN required, positive amount, no stornos.

    Reverse-charge invoices keep the QR: they are typically B2B with intra-EU
    SEPA, so payment by transfer still applies.
    """
    if (currency or "EUR").upper() != "EUR":
        return False
    if not iban or not _clean_iban(iban):
        return False
    return amount_cent > 0 and not is_credit_note


def invoice_epc_payload(invoice: dict[str, Any], company: dict[str, Any]) -> str | None:
    """EPC payload for the invoice's open balance, or None if it gets no QR."""
    iban = (company.get("bankIban") or "").strip()
    amount_cent = open_balance_cent(invoice)
    if not should_emit_qr(
        currency=invoice.get("currency") or "EUR",
        iban=iban,
        amount_cent=amount_cent,
        is_credit_note=bool(invoice.get("isCreditNote")),
    ):
        return None
    return build_epc_payload(
        beneficiary_name=company.get("companyName") or company.get("ownerName") or "",
        iban=iban,
        amount_cent=amount_cent,
        bic=company.get("bankBic"),
        remittance=f"Rechnung {invoice.get('number', '')}".strip(),
    )


def epc_qr_svg(payload: str) -> str:
    """The QR for `payload` as SVG markup."""
    import segno

    qr = segno.make(payload, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="svg", xmldecl=False, svgns=True, scale=4, border=2)
    return buf.getvalue().decode("utf-8")


def epc_qr_svg_data_uri(payload: str) -> str:
    """Return an inline data: URI containing the QR as SVG."""
    encoded = base64.b64encode(epc_qr_svg(payload).encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"
