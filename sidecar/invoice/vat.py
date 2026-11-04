"""VAT arithmetic shared by the XML and the PDF renderer."""
from __future__ import annotations

import math
from typing import Any


def line_tax_cent(line_total_cent: int, rate_percent: float) -> int:
    """Per-line VAT rounded like the app's Math.round (half up, not banker's),
    so the group sums reconcile with the invoice's TaxTotalAmount."""
    return math.floor(line_total_cent * rate_percent / 100 + 0.5)


def vat_groups(items: list[dict[str, Any]], is_klein: bool, sign: int = 1) -> list[dict[str, Any]]:
    """Sum line totals and tax per rate group, sorted by rate asc.

    Tax is rounded on the unsigned line total and signed afterwards, matching
    how the app derives a credit note's VAT from the positive invoice.
    """
    groups: dict[float, dict[str, Any]] = {}
    for it in items:
        rate = 0 if is_klein else float(it.get("vatRate") or 0)
        line = int(it.get("lineTotal") or 0)
        tax = 0 if is_klein else line_tax_cent(line, rate)
        group = groups.setdefault(rate, {"rate": rate, "basis": 0, "tax": 0})
        group["basis"] += line * sign
        group["tax"] += tax * sign
    if not groups:
        groups[0] = {"rate": 0, "basis": 0, "tax": 0}
    return sorted(groups.values(), key=lambda g: g["rate"])


def signed_paid_cent(invoice: dict[str, Any]) -> int:
    """Amount already paid, signed like the invoice total.

    The app records payments as positive amounts, but a credit note's total is
    negative, so its prepaid amount must be negative too (BR-CO-16).
    """
    paid = int(invoice.get("amountPaidCent") or 0)
    return -paid if invoice.get("isCreditNote") else paid


def open_balance_cent(invoice: dict[str, Any]) -> int:
    return int(invoice.get("total") or 0) - signed_paid_cent(invoice)
