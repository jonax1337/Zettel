"""Regex heuristics of the text-layer fallback extractor."""
from __future__ import annotations

import datetime as dt

import pytest

from invoice.text_extract import (
    _de_amount_to_cents,
    _find_due_date,
    _find_issue_date,
    _find_total_cents,
    _find_vat_id,
    _guess_vendor_name,
)


def _unix(year: int, month: int, day: int) -> int:
    return int(dt.datetime(year, month, day).timestamp())


@pytest.mark.parametrize(
    "raw, cents",
    [("1.234,56", 123456), ("1234,56", 123456), ("1234.56", 123456), ("0,99", 99), ("abc", None), ("", None)],
)
def test_amount_parsing(raw, cents):
    assert _de_amount_to_cents(raw) == cents


class TestTotal:
    def test_cue_with_currency(self):
        assert _find_total_cents("Gesamtbetrag: 1.190,00 EUR") == 119000

    def test_value_does_not_swallow_digits_of_the_next_line(self):
        assert _find_total_cents("Gesamtbetrag 119,00\n2025 Seite 1") == 11900

    def test_falls_back_to_largest_eur_amount(self):
        assert _find_total_cents("Position 10,00 EUR\nPosition 25,50 EUR") == 2550

    def test_nothing_found(self):
        assert _find_total_cents("keine Beträge") is None


class TestDates:
    def test_issue_date_from_cue(self):
        assert _find_issue_date("Rechnungsdatum: 03.02.2025") == _unix(2025, 2, 3)

    def test_due_date_label_is_not_mistaken_for_the_issue_date(self):
        text = "Fälligkeitsdatum: 17.02.2025\nRechnungsdatum: 03.02.2025"
        assert _find_issue_date(text) == _unix(2025, 2, 3)

    def test_issue_date_falls_back_to_first_date(self):
        assert _find_issue_date("Leistung am 05.03.25 erbracht") == _unix(2025, 3, 5)

    def test_iso_date(self):
        assert _find_due_date("Due date: 2025-04-01") == _unix(2025, 4, 1)

    def test_impossible_date_is_ignored(self):
        assert _find_due_date("Fällig am: 31.02.2025") is None


def test_vat_id_whitespace_removed():
    assert _find_vat_id("USt-IdNr. DE 123456789") == "DE123456789"


class TestVendorName:
    def test_first_meaningful_line(self):
        assert _guess_vendor_name("Rechnung\n12.03.2025\nMuster GmbH\nStraße 1") == "Muster GmbH"

    def test_none_when_only_noise(self):
        assert _guess_vendor_name("--\n12345\n") is None
