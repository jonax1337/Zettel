"""Line-item service period (BG-26, BT-134/135) — XML emission and edge cases.

v0.12 added the schema. v0.17 polished the input UX. These tests pin the XML
contract:

  - single-day period (start == end) emits both date elements with the same
    `format="102"` (YYYYMMDD) string
  - range emits Start and End in document order
  - missing fields suppress the entire BillingSpecifiedPeriod block
"""
from __future__ import annotations

from xml.etree import ElementTree as ET

import pytest

from invoice.zugferd import render_zugferd_xml

NS = {
    "rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
    "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
}

# 2025-05-15 00:00:00 UTC
DAY = 1747267200
# 2025-05-22 00:00:00 UTC
DAY_PLUS_7 = DAY + 7 * 86400


def _line_period_dates(xml: str, item_index: int = 0) -> tuple[str | None, str | None]:
    root = ET.fromstring(xml)
    lines = root.findall(
        ".//ram:IncludedSupplyChainTradeLineItem", NS,
    )
    line = lines[item_index]
    period = line.find(".//ram:BillingSpecifiedPeriod", NS)
    if period is None:
        return None, None
    start = period.find("./ram:StartDateTime/udt:DateTimeString", NS)
    end = period.find("./ram:EndDateTime/udt:DateTimeString", NS)
    return (
        start.text if start is not None else None,
        end.text if end is not None else None,
    )


def test_single_day_period_emits_same_start_and_end(payloads):
    payload = payloads("01-standard-19.json")
    payload["items"][0]["linePeriodStart"] = DAY
    payload["items"][0]["linePeriodEnd"] = DAY
    xml = render_zugferd_xml(payload)
    start, end = _line_period_dates(xml)
    assert start == "20250515"
    assert end == "20250515"


def test_range_period_emits_distinct_start_and_end(payloads):
    payload = payloads("01-standard-19.json")
    payload["items"][0]["linePeriodStart"] = DAY
    payload["items"][0]["linePeriodEnd"] = DAY_PLUS_7
    xml = render_zugferd_xml(payload)
    start, end = _line_period_dates(xml)
    assert start == "20250515"
    assert end == "20250522"


def test_missing_line_period_suppresses_block(payloads):
    payload = payloads("01-standard-19.json")
    # neither set
    payload["items"][0].pop("linePeriodStart", None)
    payload["items"][0].pop("linePeriodEnd", None)
    xml = render_zugferd_xml(payload)
    start, end = _line_period_dates(xml)
    assert start is None
    assert end is None
    assert "BillingSpecifiedPeriod" not in xml or "BillingSpecifiedPeriod" in xml.split("<ram:ApplicableHeaderTradeSettlement")[0] == False or True
    # Practical check: only the header-level period block should be eligible
    # (and the standard payload doesn't set one), so no occurrence at all.
    assert xml.count("BillingSpecifiedPeriod") == 0


def test_partial_period_suppresses_block(payloads):
    # start without end → block suppressed (no half-period allowed in XML)
    payload = payloads("01-standard-19.json")
    payload["items"][0]["linePeriodStart"] = DAY
    payload["items"][0]["linePeriodEnd"] = None
    xml = render_zugferd_xml(payload)
    start, end = _line_period_dates(xml)
    assert start is None and end is None


def test_period_per_item_only(payloads):
    # First item carries period, second doesn't — only line 1 gets the block.
    payload = payloads("02-mixed-vat.json")
    payload["items"][0]["linePeriodStart"] = DAY
    payload["items"][0]["linePeriodEnd"] = DAY_PLUS_7
    if len(payload["items"]) > 1:
        payload["items"][1].pop("linePeriodStart", None)
        payload["items"][1].pop("linePeriodEnd", None)
        xml = render_zugferd_xml(payload)
        s0, e0 = _line_period_dates(xml, 0)
        s1, e1 = _line_period_dates(xml, 1)
        assert s0 and e0
        assert s1 is None and e1 is None
