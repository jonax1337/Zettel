"""Offer and reminder PDFs must format amounts in the document's currency."""
from __future__ import annotations

import re

from invoice.pdf import render_offer_html, render_reminder_html


def _text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def _offer(currency: str | None) -> dict:
    offer = {
        "number": "AN-1",
        "issueDate": 1774306800,
        "validUntil": 1774306800,
        "subtotal": 10000,
        "vatAmount": 1900,
        "total": 11900,
    }
    if currency:
        offer["currency"] = currency
    return {
        "offer": offer,
        "items": [
            {"position": 1, "description": "Beratung", "quantity": 1, "unit": "Stk",
             "unitPrice": 10000, "vatRate": 19, "lineTotal": 10000},
        ],
        "company": {"companyName": "Firma"},
        "customer": {"name": "Kunde"},
    }


def _reminder(currency: str | None, fee: int = 0, interest: int = 0) -> dict:
    invoice = {"invoiceNumber": "RE-1", "invoiceIssueDate": 1774306800, "invoiceDueDate": 1774306800}
    if currency:
        invoice["currency"] = currency
    return {
        "reminder": {
            "number": "MA-1",
            "levelLabel": "Mahnung",
            "issueDate": 1774306800,
            "dueDate": 1774306800,
            "feeCents": fee,
            "interestCents": interest,
            "originalTotalCents": 100000,
            "totalDueCents": 100000 + fee + interest,
        },
        "invoice": invoice,
        "company": {"companyName": "Firma"},
        "customer": {"name": "Kunde"},
    }


class TestOfferCurrency:
    def test_usd_offer_uses_the_dollar_sign(self):
        text = _text(render_offer_html(_offer("USD")))

        assert "119,00 $" in text
        assert "€" not in text

    def test_offer_without_currency_stays_euro(self):
        assert "119,00 €" in _text(render_offer_html(_offer(None)))


class TestReminderCurrency:
    def test_eur_reminder_sums_fee_into_the_total(self):
        text = _text(render_reminder_html(_reminder("EUR", fee=500)))

        assert "Mahngebühr 5,00 €" in text
        assert "Zu zahlender Gesamtbetrag 1.005,00 €" in text

    def test_reminder_without_currency_stays_euro(self):
        assert "Offener Rechnungsbetrag 1.000,00 €" in _text(render_reminder_html(_reminder(None)))

    def test_usd_reminder_prints_the_invoice_currency(self):
        text = _text(render_reminder_html(_reminder("USD")))

        assert "Offener Rechnungsbetrag 1.000,00 $" in text
        assert "€" not in text

    def test_usd_reminder_keeps_eur_fees_apart_from_the_amount(self):
        text = _text(render_reminder_html(_reminder("USD", fee=500, interest=250)))

        assert "Mahngebühr (in EUR) 5,00 €" in text
        assert "Verzugszinsen (in EUR) 2,50 €" in text
        assert "Zu zahlender Gesamtbetrag 1.000,00 $ zzgl. 7,50 €" in text
        assert "1.007,50" not in text
