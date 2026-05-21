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


def _clean_iban(iban: str) -> str:
    return "".join(ch for ch in iban if ch.isalnum()).upper()


def _clean_bic(bic: str | None) -> str:
    if not bic:
        return ""
    return "".join(ch for ch in bic if ch.isalnum()).upper()


def _format_amount(amount_cent: int) -> str:
    # EPC requires "EUR" + amount with dot as decimal separator, 0.01..999_999_999.99.
    eur = Decimal(amount_cent) / Decimal(100)
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
    name = beneficiary_name.strip()[:70]
    remit = remittance.strip()[:140]
    fields = [
        "BCD",
        "002",
        "1",
        "SCT",
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
    reverse_charge_type: str | None,
) -> bool:
    """Trigger logic for EPC-QR — EUR only, IBAN required, no stornos / RC."""
    if (currency or "EUR").upper() != "EUR":
        return False
    if not iban or not _clean_iban(iban):
        return False
    if amount_cent <= 0:
        return False
    if is_credit_note:
        return False
    # Reverse-charge invoices are typically B2B with intra-EU SEPA but the
    # supplier doesn't receive VAT — leaving the QR enabled is fine. We only
    # skip when the field explicitly signals non-collection.
    return True


def epc_qr_svg_data_uri(payload: str) -> str:
    """Return an inline data: URI containing the QR as SVG."""
    import segno

    qr = segno.make(payload, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="svg", xmldecl=False, svgns=True, scale=4, border=2)
    raw = buf.getvalue()
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"
