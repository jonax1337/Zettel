"""MT940 (Swift) bank statement parser.

We use the `mt-940` library which handles the format quirks (different bank
variants, multi-line :86: structured purpose fields, etc.). Output is the same
unified Booking dict as CAMT.053.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from .booking import make_booking, to_cents


def _transaction_to_booking(data: dict[str, Any]) -> dict[str, Any]:
    amount = data.get("amount")

    val_dt = data.get("date") or data.get("entry_date")

    # Der Verwendungszweck wird immer zusammen als ein String übernommen.
    purpose = data.get("transaction_details") or data.get("purpose") or ""
    if isinstance(purpose, list):
        purpose = " ".join(str(x) for x in purpose if x)

    partner = data.get("applicant_name") or data.get("applicant_creditor_id") or ""

    return make_booking(
        valuta_date=val_dt.isoformat() if isinstance(val_dt, date) else "",
        amount_cent=to_cents(amount.amount) if amount is not None else 0,
        currency=(amount.currency or "") if amount is not None else "",
        party_name=str(partner).strip(),
        purpose=str(purpose).strip(),
        transaction_id=str(data.get("bank_reference") or data.get("customer_reference") or ""),
    )


def parse_mt940(content: str) -> list[dict[str, Any]]:
    import mt940  # type: ignore[import-untyped]

    transactions = mt940.models.Transactions()
    try:
        transactions.parse(content)
    except Exception as e:
        raise ValueError(f"MT940-Parse fehlgeschlagen: {e}") from e

    return [_transaction_to_booking(tx.data) for tx in transactions]
