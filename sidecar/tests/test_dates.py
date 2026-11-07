"""Calendar dates must print as the day the app stored.

The app stores dates as local midnight (the CLI as local noon). Reading them
back in UTC shifted every date in the PDF and the XML one day early.
"""
from __future__ import annotations

import re
from datetime import datetime
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

import pytest

from invoice.pdf import render_invoice_html, render_offer_html, render_reminder_html
from invoice.templates import fmt_date_unix
from invoice.zugferd import render_zugferd_xml

BERLIN = ZoneInfo("Europe/Berlin")
NS = {
    "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
    "qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
}

# 2026-03-24 00:00 Europe/Berlin (CET) — one day earlier in UTC.
LOCAL_MIDNIGHT = 1774306800


def _local(year: int, month: int, day: int, hour: int = 0) -> int:
    return int(datetime(year, month, day, hour, tzinfo=BERLIN).timestamp())


class TestDisplayDate:
    def test_local_midnight_prints_the_stored_day(self):
        assert fmt_date_unix(LOCAL_MIDNIGHT) == "24.03.2026"

    @pytest.mark.parametrize("hour", [0, 12, 23])
    @pytest.mark.parametrize("month", [1, 7])
    def test_any_time_of_day_in_winter_and_summer_time(self, month, hour):
        assert fmt_date_unix(_local(2026, month, 15, hour)) == "15.%02d.2026" % month

    def test_missing_date_is_empty(self):
        assert fmt_date_unix(None) == ""


def _dated_invoice(payloads) -> dict:
    payload = payloads("01-standard-19.json")
    invoice = payload["invoice"]
    invoice.update(
        issueDate=LOCAL_MIDNIGHT,
        dueDate=LOCAL_MIDNIGHT,
        deliveryDate=LOCAL_MIDNIGHT,
        servicePeriodStart=None,
        servicePeriodEnd=None,
        skontoPercent=2,
        skontoDays=7,
        skontoAmountCent=238,
        skontoDeadline=LOCAL_MIDNIGHT,
    )
    payload["items"][0]["linePeriodStart"] = LOCAL_MIDNIGHT
    payload["items"][0]["linePeriodEnd"] = LOCAL_MIDNIGHT
    return payload


def _xml_dates(xml: str) -> list[str]:
    root = ET.fromstring(xml)
    return [
        el.text
        for el in root.iter()
        if el.tag.endswith("DateTimeString") and el.text
    ]


class TestInvoiceXmlDates:
    def test_every_date_element_prints_the_stored_day(self, payloads):
        payload = _dated_invoice(payloads)
        payload["invoice"]["servicePeriodStart"] = LOCAL_MIDNIGHT
        payload["invoice"]["servicePeriodEnd"] = LOCAL_MIDNIGHT
        payload["invoice"]["deliveryDate"] = None

        dates = _xml_dates(render_zugferd_xml(payload))

        assert dates
        assert set(dates) == {"20260324"}

    def test_delivery_date(self, payloads):
        dates = _xml_dates(render_zugferd_xml(_dated_invoice(payloads)))
        assert "20260324" in dates
        assert not any(d.startswith("20260323") for d in dates)

    def test_storno_reference_date(self, payloads):
        payload = _dated_invoice(payloads)
        payload["invoice"]["isCreditNote"] = True
        payload["invoice"]["correctsInvoice"] = {"number": "RE-1", "issueDate": LOCAL_MIDNIGHT}

        root = ET.fromstring(render_zugferd_xml(payload))
        ref = root.find(".//ram:InvoiceReferencedDocument/ram:FormattedIssueDateTime/qdt:DateTimeString", NS)

        assert ref is not None and ref.text == "20260324"


def _text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


class TestInvoiceHtmlDates:
    def test_issue_due_delivery_line_period_and_skonto_deadline(self, payloads):
        text = _text(render_invoice_html(_dated_invoice(payloads)))

        assert text.count("24.03.2026") >= 4
        assert "23.03.2026" not in text

    def test_service_period(self, payloads):
        payload = _dated_invoice(payloads)
        payload["invoice"]["servicePeriodStart"] = LOCAL_MIDNIGHT
        payload["invoice"]["servicePeriodEnd"] = LOCAL_MIDNIGHT + 7 * 86400

        text = _text(render_invoice_html(payload))

        assert "24.03.2026 – 31.03.2026" in text

    def test_storno_reference_date(self, payloads):
        payload = _dated_invoice(payloads)
        payload["invoice"]["isCreditNote"] = True
        payload["invoice"]["correctsInvoice"] = {"number": "RE-1", "issueDate": LOCAL_MIDNIGHT}

        assert "Storno zur Rechnung RE-1 vom 24.03.2026" in _text(render_invoice_html(payload))


def test_offer_dates_print_the_stored_day():
    payload = {
        "offer": {
            "number": "AN-1",
            "issueDate": LOCAL_MIDNIGHT,
            "validUntil": LOCAL_MIDNIGHT,
            "subtotal": 0,
            "vatAmount": 0,
            "total": 0,
            "servicePeriodStart": LOCAL_MIDNIGHT,
            "servicePeriodEnd": LOCAL_MIDNIGHT,
        },
        "items": [],
        "company": {"companyName": "Firma"},
        "customer": {"name": "Kunde"},
    }

    text = _text(render_offer_html(payload))

    assert text.count("24.03.2026") >= 3
    assert "23.03.2026" not in text


def test_reminder_dates_print_the_stored_day():
    payload = {
        "reminder": {"number": "MA-1", "levelLabel": "Mahnung", "issueDate": LOCAL_MIDNIGHT,
            "dueDate": LOCAL_MIDNIGHT, "originalTotalCents": 0, "totalDueCents": 0},
        "invoice": {
            "invoiceNumber": "RE-1",
            "invoiceIssueDate": LOCAL_MIDNIGHT,
            "invoiceDueDate": LOCAL_MIDNIGHT,
        },
        "company": {"companyName": "Firma"},
        "customer": {"name": "Kunde"},
    }

    text = _text(render_reminder_html(payload))

    assert text.count("24.03.2026") >= 4
    assert "23.03.2026" not in text
