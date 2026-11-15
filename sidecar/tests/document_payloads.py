"""Offer and reminder payloads derived from an invoice test payload."""
from __future__ import annotations


def offer_payload(base: dict) -> dict:
    return {
        "offer": {
            "number": "AN-1",
            "issueDate": 1774306800,
            "validUntil": 1774906800,
            "subtotal": 25000,
            "vatAmount": 4150,
            "total": 29150,
            "introText": "Guten Tag",
        },
        "items": base["items"],
        "company": base["company"],
        "customer": base["customer"],
    }


def reminder_payload(base: dict) -> dict:
    return {
        "reminder": {
            "number": "MA-1",
            "levelLabel": "Mahnung",
            "issueDate": 1774306800,
            "dueDate": 1774906800,
            "feeCents": 500,
            "interestCents": 0,
            "originalTotalCents": 29150,
            "totalDueCents": 29650,
            "bodyText": "Bitte zahlen.",
        },
        "invoice": {"invoiceNumber": "RE-1", "invoiceIssueDate": 1774306800, "invoiceDueDate": 1774306800},
        "company": base["company"],
        "customer": base["customer"],
    }
