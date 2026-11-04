"""The unified `Booking` dict shared by the CAMT.053 and MT940 parsers."""
from __future__ import annotations

from decimal import Decimal
from typing import Any

CENTS_PER_UNIT = 100


def to_cents(amount: Decimal) -> int:
    return int((amount * CENTS_PER_UNIT).to_integral_value())


def make_booking(
    *,
    valuta_date: str,
    amount_cent: int,
    currency: str,
    party_name: str,
    purpose: str,
    transaction_id: str,
) -> dict[str, Any]:
    return {
        "valutaDate": valuta_date,
        "amountCent": amount_cent,
        "currency": currency,
        "partyName": party_name,
        "purpose": purpose,
        "transactionId": transaction_id,
    }
