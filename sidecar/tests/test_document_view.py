"""Content of the document view that the PDF engines render."""
from __future__ import annotations

from invoice.document_view import invoice_view


def _company_lines(payload: dict) -> list[str]:
    return [line["text"] for line in invoice_view(payload)["footer"][0]["lines"]]


def test_footer_names_managing_directors_and_register(payloads):
    payload = payloads("02-mixed-vat.json")
    payload["company"] |= {
        "registerCourt": " Amtsgericht Berlin ", "registerNumber": "HRB 1", "managingDirectors": "Erika Mustermann",
    }

    lines = _company_lines(payload)

    assert "Geschäftsführung: Erika Mustermann" in lines
    assert "Amtsgericht Berlin HRB 1" in lines


def test_footer_prints_a_register_number_without_court(payloads):
    payload = payloads("02-mixed-vat.json")
    payload["company"] |= {"registerCourt": None, "registerNumber": "HRB 1"}

    assert "HRB 1" in _company_lines(payload)


def test_footer_without_register_data_has_no_such_lines(payloads):
    payload = payloads("02-mixed-vat.json")
    for key in ("registerCourt", "registerNumber", "managingDirectors"):
        payload["company"].pop(key, None)

    lines = _company_lines(payload)

    assert not any("Geschäftsführung" in line or "HRB" in line for line in lines)
