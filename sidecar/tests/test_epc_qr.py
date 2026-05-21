"""Tests for the EPC-QR-Code (Girocode) builder."""
from __future__ import annotations

import base64
import re

import pytest

from invoice.qr import (
    build_epc_payload,
    epc_qr_svg_data_uri,
    should_emit_qr,
)


def test_trigger_skips_non_eur():
    assert should_emit_qr(
        currency="USD",
        iban="DE89370400440532013000",
        amount_cent=10000,
        is_credit_note=False,
        reverse_charge_type=None,
    ) is False


def test_trigger_skips_missing_iban():
    assert should_emit_qr(
        currency="EUR",
        iban=None,
        amount_cent=10000,
        is_credit_note=False,
        reverse_charge_type=None,
    ) is False
    assert should_emit_qr(
        currency="EUR",
        iban="",
        amount_cent=10000,
        is_credit_note=False,
        reverse_charge_type=None,
    ) is False


def test_trigger_skips_credit_note():
    assert should_emit_qr(
        currency="EUR",
        iban="DE89370400440532013000",
        amount_cent=10000,
        is_credit_note=True,
        reverse_charge_type=None,
    ) is False


def test_trigger_skips_zero_amount():
    assert should_emit_qr(
        currency="EUR",
        iban="DE89370400440532013000",
        amount_cent=0,
        is_credit_note=False,
        reverse_charge_type=None,
    ) is False


def test_trigger_emits_for_standard_invoice():
    assert should_emit_qr(
        currency="EUR",
        iban="DE89 3704 0044 0532 0130 00",  # spaces tolerated
        amount_cent=5950,
        is_credit_note=False,
        reverse_charge_type="none",
    ) is True


def test_payload_format_minimal():
    payload = build_epc_payload(
        beneficiary_name="Jonas Laux",
        iban="DE89370400440532013000",
        amount_cent=1234,
    )
    lines = payload.split("\n")
    assert lines[0] == "BCD"
    assert lines[1] == "002"
    assert lines[2] == "1"
    assert lines[3] == "SCT"
    assert lines[4] == ""  # BIC empty
    assert lines[5] == "Jonas Laux"
    assert lines[6] == "DE89370400440532013000"
    assert lines[7] == "EUR12.34"


def test_payload_strips_iban_spaces_and_uppercase():
    payload = build_epc_payload(
        beneficiary_name="Test",
        iban="de89 3704 0044 0532 0130 00",
        amount_cent=100,
    )
    assert "DE89370400440532013000" in payload


def test_payload_includes_remittance_when_present():
    payload = build_epc_payload(
        beneficiary_name="Test GmbH",
        iban="DE89370400440532013000",
        amount_cent=10000,
        bic="COBADEFFXXX",
        remittance="Rechnung RE-2026-0042",
    )
    lines = payload.split("\n")
    assert lines[4] == "COBADEFFXXX"
    assert lines[-1] == "Rechnung RE-2026-0042"


def test_payload_truncates_name_to_70_chars():
    long_name = "X" * 200
    payload = build_epc_payload(
        beneficiary_name=long_name,
        iban="DE89370400440532013000",
        amount_cent=100,
    )
    name_line = payload.split("\n")[5]
    assert len(name_line) == 70


def test_payload_amount_two_decimals():
    # Pflicht: zwei Nachkommastellen mit Punkt-Trennzeichen.
    payload = build_epc_payload(
        beneficiary_name="X",
        iban="DE89370400440532013000",
        amount_cent=100,  # 1,00 EUR
    )
    assert "EUR1.00" in payload


def test_qr_svg_data_uri_is_valid_data_url():
    payload = build_epc_payload(
        beneficiary_name="X",
        iban="DE89370400440532013000",
        amount_cent=1000,
    )
    uri = epc_qr_svg_data_uri(payload)
    assert uri.startswith("data:image/svg+xml;base64,")
    # Decoding should yield SVG content
    encoded = uri.split(",", 1)[1]
    raw = base64.b64decode(encoded)
    assert b"<svg" in raw
