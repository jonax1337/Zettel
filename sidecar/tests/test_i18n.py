"""Tests for the PDF translation table (invoice/i18n.py).

Solo-tool, flat key dict — these tests are an inventory check: every key
present in DE must also be present in EN, no orphan keys, no missing
placeholders in interpolated strings.
"""
from __future__ import annotations

import re

import pytest

from invoice.i18n import _DE, _EN, t  # type: ignore[attr-defined]


def test_de_and_en_have_identical_key_sets():
    de_keys = set(_DE.keys())
    en_keys = set(_EN.keys())
    only_de = de_keys - en_keys
    only_en = en_keys - de_keys
    assert not only_de, f"keys missing in EN: {sorted(only_de)}"
    assert not only_en, f"keys missing in DE: {sorted(only_en)}"


@pytest.mark.parametrize("lang", ["de", "en"])
def test_no_empty_translations(lang: str):
    table = _DE if lang == "de" else _EN
    blanks = [k for k, v in table.items() if not v.strip()]
    assert not blanks, f"empty translations in {lang}: {blanks}"


def test_t_returns_german_by_default():
    assert t("doctype_invoice") == "Rechnung"


def test_t_returns_english_when_requested():
    assert t("doctype_invoice", language="en") == "Invoice"


def test_t_falls_back_to_de_for_unknown_language():
    assert t("doctype_invoice", language="zz") == "Rechnung"


def test_t_falls_back_to_key_for_unknown_key():
    assert t("unknown_key_xyz", language="de") == "unknown_key_xyz"
    assert t("unknown_key_xyz", language="en") == "unknown_key_xyz"


def test_t_interpolates_kwargs():
    out = t("skonto_inline", language="de", date="22.05.2026", percent=2, amount="3,57 €")
    assert "22.05.2026" in out
    assert "2 %" in out
    assert "3,57 €" in out


def test_t_interpolation_safe_against_missing_kwargs():
    # missing kwargs return the raw template instead of crashing — caller's bug,
    # not the user's.
    out = t("skonto_inline", language="de", date="22.05.2026")
    assert "{percent}" in out or "Skonto" in out


_PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


@pytest.mark.parametrize("key", ["skonto_inline", "skonto_offer_text", "credit_note_ref", "offer_disclaimer", "page_n_of_m"])
def test_de_and_en_share_the_same_placeholders(key: str):
    de_holders = set(_PLACEHOLDER_RE.findall(_DE[key]))
    en_holders = set(_PLACEHOLDER_RE.findall(_EN[key]))
    assert de_holders == en_holders, (
        f"placeholder drift in '{key}': DE={de_holders} EN={en_holders}"
    )
