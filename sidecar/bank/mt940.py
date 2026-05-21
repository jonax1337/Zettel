"""MT940 (Swift) bank statement parser.

We use the `mt-940` library which handles the format quirks (different bank
variants, multi-line :86: structured purpose fields, etc.). Output is the same
unified Booking dict as CAMT.053.
"""
from __future__ import annotations

from datetime import date
from typing import Any


def parse_mt940(content: str) -> list[dict[str, Any]]:
    import mt940  # type: ignore[import-untyped]

    transactions = mt940.models.Transactions()
    try:
        transactions.parse(content)
    except Exception as e:
        raise ValueError(f"MT940-Parse fehlgeschlagen: {e}") from e

    out: list[dict[str, Any]] = []
    for tx in transactions:
        data = tx.data
        amount = data.get("amount")
        amount_cent = 0
        currency = ""
        if amount is not None:
            # mt940's Amount uses Decimal.
            amount_cent = int((amount.amount * 100).to_integral_value())
            currency = amount.currency or ""

        val_dt = data.get("date") or data.get("entry_date")
        date_str = ""
        if isinstance(val_dt, date):
            date_str = val_dt.isoformat()

        # `extra_details` enthält bei strukturierten :86:-Records oft den
        # Kontrahenten-Namen separat. Wir nehmen den Verwendungszweck immer
        # zusammen als String.
        purpose = (
            data.get("transaction_details")
            or data.get("purpose")
            or ""
        )
        if isinstance(purpose, list):
            purpose = " ".join(str(x) for x in purpose if x)
        purpose = str(purpose).strip()

        partner = (
            data.get("applicant_name")
            or data.get("applicant_creditor_id")
            or ""
        )
        partner = str(partner).strip()

        tx_id = str(data.get("bank_reference") or data.get("customer_reference") or "")

        out.append(
            {
                "valutaDate": date_str,
                "amountCent": amount_cent,
                "currency": currency,
                "partyName": partner,
                "purpose": purpose,
                "transactionId": tx_id,
            }
        )
    return out
