"""cli/zettel.py must stay in step with the app: shared fixture math plus the defaults a new invoice gets."""
from __future__ import annotations

import importlib.util
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

CLI_PATH = Path(__file__).resolve().parents[2] / "cli" / "zettel.py"
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "invoice-parity.json"

# The app asserts the same file in src/lib/utils/invoice-parity.test.ts.
FIXTURE = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def cli():
    # cli/ is not gitignored, so importing it must not leave a __pycache__ behind.
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec = importlib.util.spec_from_file_location("zettel_cli_parity", CLI_PATH)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


class TestSharedFixture:
    @pytest.mark.parametrize("case", FIXTURE["totals"], ids=lambda c: c["name"])
    def test_totals(self, cli, case):
        items = [
            {"quantity": i["quantity"], "unitPrice": i["unitPrice"], "vatRate": i["vatRate"]}
            for i in case["items"]
        ]
        totals = cli.compute_totals(items, case["isKleinunternehmer"], case["isReverseCharge"])
        assert totals == case["expected"]

    @pytest.mark.parametrize("case", FIXTURE["invoiceNumbers"], ids=lambda c: f"{c['pattern']}#{c['counter']}")
    def test_invoice_numbers(self, cli, case):
        year, month, day = (int(part) for part in case["date"].split("-"))
        assert cli.format_invoice_number(case["pattern"], case["counter"], datetime(year, month, day)) == case["expected"]

    @pytest.mark.parametrize(
        "case", FIXTURE["eurTotals"], ids=lambda c: f"{c['totalCent']}{c['currency']}@{c['exchangeRate']}"
    )
    def test_eur_totals(self, cli, case):
        result = cli.compute_eur_total_cent(case["currency"], case["totalCent"], case["exchangeRate"])
        assert result == case["expected"]

    @pytest.mark.parametrize("case", FIXTURE["paymentTerms"], ids=lambda c: str(c["days"]))
    def test_payment_terms(self, cli, case):
        assert cli.payment_terms_text(case["days"]) == case["expected"]


DRAFT_SCHEMA = """
CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT, customer_id INTEGER, customer_snapshot TEXT,
    issue_date INTEGER, delivery_date INTEGER, due_date INTEGER, status TEXT,
    subtotal INTEGER, vat_amount INTEGER, total INTEGER, is_kleinunternehmer INTEGER,
    is_reverse_charge INTEGER, reverse_charge_type TEXT, supply_kind TEXT, notes TEXT, payment_terms TEXT,
    is_credit_note INTEGER, corrects_invoice_id INTEGER, currency TEXT, exchange_rate TEXT,
    eur_total_cent INTEGER, notes_internal TEXT, follow_up_date INTEGER,
    service_period_start INTEGER, service_period_end INTEGER, skonto_percent REAL,
    skonto_days INTEGER, pdf_language TEXT, pdf_path TEXT, updated_at INTEGER,
    last_validation_status TEXT, last_validated_at INTEGER, last_validation_findings_count INTEGER,
    buyer_reference TEXT
);
CREATE TABLE settings (
    id INTEGER PRIMARY KEY, default_payment_terms_days INTEGER, company_name TEXT, owner_name TEXT,
    street TEXT, postal_code TEXT, city TEXT, phone TEXT, email TEXT, vat_id TEXT, tax_number TEXT, bank_iban TEXT
);
CREATE TABLE customers (
    id INTEGER PRIMARY KEY, customer_number TEXT, name TEXT, contact_person TEXT, street TEXT,
    postal_code TEXT, city TEXT, country TEXT, email TEXT, vat_id TEXT, leitweg_id TEXT
);
"""

CUSTOMER = {
    "id": 1, "customer_number": "K-0001", "name": "A", "contact_person": None,
    "street": None, "postal_code": None, "city": None, "country": None, "email": None, "vat_id": None,
    "leitweg_id": None,
}
TOTALS = {"subtotal": 10000, "vatAmount": 1900, "total": 11900}


@pytest.fixture
def con():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(DRAFT_SCHEMA)
    yield connection
    connection.close()


def create_args(**overrides):
    values = dict(
        issue_date="2026-03-20", due_date=None, delivery_date=None, payment_terms=14,
        reverse_charge="none", supply_kind="services", notes=None, service_start=None, service_end=None,
        skonto_percent=None, skonto_days=None, no_skonto=False, pdf_language=None,
        currency="EUR", exchange_rate=None,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def create_draft(cli, con, settings=None, **overrides):
    settings = {"default_payment_terms_days": 14, "is_kleinunternehmer": 0, **(settings or {})}
    invoice_id = cli.insert_draft_invoice(con, create_args(**overrides), CUSTOMER, settings, TOTALS, False)
    return con.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()


COMPANY_FIELDS = {
    "companyName": "company_name", "ownerName": "owner_name", "street": "street", "postalCode": "postal_code",
    "city": "city", "phone": "phone", "email": "email", "vatId": "vat_id", "taxNumber": "tax_number",
    "bankIban": "bank_iban",
}


@pytest.mark.parametrize("case", FIXTURE["xrechnungMissing"], ids=lambda c: c["name"])
def test_xrechnung_pre_export_check(cli, case):
    base, change = FIXTURE["xrechnungComplete"], case["change"]
    company = {**base["company"], **change.get("company", {})}
    customer = {**base["customer"], **change.get("customer", {})}
    buyer_reference = change["buyerReference"] if "buyerReference" in change else base["buyerReference"]
    missing = cli.missing_xrechnung_fields(
        buyer_reference, {COMPANY_FIELDS[key]: value for key, value in company.items()}, customer
    )
    assert missing == case["expected"]


class TestBuyerReferenceDefault:
    def test_is_copied_from_the_customers_leitweg_id_like_the_app(self, cli, con, monkeypatch):
        monkeypatch.setitem(CUSTOMER, "leitweg_id", " 04011000-1234512345-35 ")
        assert create_draft(cli, con)["buyer_reference"] == "04011000-1234512345-35"

    def test_stays_empty_for_a_customer_without_one(self, cli, con):
        assert create_draft(cli, con)["buyer_reference"] is None


@pytest.mark.parametrize("case", FIXTURE["xrechnungFallback"], ids=lambda c: c["name"])
def test_xrechnung_live_customer_fallbacks(cli, case):
    live = {"leitweg_id": case["liveLeitwegId"], "email": case["liveEmail"]}
    buyer_reference, customer = cli.with_live_customer_fallbacks(
        case["invoiceBuyerReference"], {"email": case["snapshotEmail"], "name": "A"}, live
    )
    assert {"buyerReference": buyer_reference, "email": customer["email"]} == case["expected"]


def test_xrechnung_fallbacks_without_a_live_customer(cli):
    snapshot = {"email": None}
    assert cli.with_live_customer_fallbacks(None, snapshot, None) == (None, {"email": None})
    assert snapshot == {"email": None}


def test_payload_trims_what_the_pre_check_accepted(cli):
    company = {
        "company_name": "A", "owner_name": " Jonas Laux ", "street": "S", "postal_code": "1", "city": "C",
        "country": "DE", "tax_number": None, "vat_id": "DE1", "email": " a@b.de ", "phone": " +49 30 123 ",
        "website": None, "bank_name": None, "bank_iban": "DE00", "bank_bic": None, "is_kleinunternehmer": 0,
        "kleinunternehmer_note": None, "logo_path": None, "zugferd_profile": None, "pdf_theme": None,
        "pdf_renderer": None,
    }
    inv = {
        key: None for key in (
            "number", "issue_date", "delivery_date", "due_date", "subtotal", "vat_amount", "total",
            "reverse_charge_type", "supply_kind", "notes", "payment_terms", "currency", "exchange_rate",
            "eur_total_cent", "service_period_start", "service_period_end", "skonto_percent", "skonto_days",
            "amount_paid_cent", "pdf_language", "buyer_reference",
        )
    } | {"is_kleinunternehmer": 0, "is_reverse_charge": 0, "is_credit_note": 0, "total": 0}
    payload = cli.build_pdf_payload(inv, [], {"name": "K", "email": " k@x.de "}, company, "out.xml")
    assert (payload["company"]["ownerName"], payload["company"]["email"], payload["company"]["phone"]) == (
        "Jonas Laux", "a@b.de", "+49 30 123",
    )
    assert payload["customer"]["email"] == "k@x.de"


class TestXrechnungExport:
    @staticmethod
    def stub_invoice(cli, monkeypatch, number, buyer_reference="04011000-1234512345-35", snapshot=None):
        monkeypatch.setattr(cli, "load_invoice_full", lambda con, invoice_id: (
            {"number": number, "buyer_reference": buyer_reference, "customer_id": 1}, [], snapshot or {},
        ))

    def test_a_draft_is_refused(self, cli, con, monkeypatch):
        self.stub_invoice(cli, monkeypatch, "DRAFT-0123456789abcdef")
        with pytest.raises(SystemExit, match="Entwürfe"):
            cli.export_xrechnung_for(con, 1)

    def test_missing_fields_are_listed_instead_of_writing_a_file(self, cli, con, monkeypatch):
        con.execute("INSERT INTO settings (id) VALUES (1)")
        self.stub_invoice(cli, monkeypatch, "RE-2026-0001", buyer_reference=None)
        monkeypatch.setattr(cli, "call_sidecar", lambda *args: pytest.fail("must not call the sidecar"))
        with pytest.raises(SystemExit) as exit_info:
            cli.export_xrechnung_for(con, 1)
        message = str(exit_info.value)
        assert "  - Leitweg-ID / Käuferreferenz" in message
        assert "  - Anschrift des Verkäufers" in message

    def test_writes_the_xml_next_to_the_pdf(self, cli, con, monkeypatch, tmp_path):
        con.execute("INSERT INTO settings (id) VALUES (1)")
        self.stub_invoice(cli, monkeypatch, "RE-2026-0001")
        monkeypatch.setattr(cli, "missing_xrechnung_fields", lambda *args: [])
        monkeypatch.setattr(cli, "pdf_output_dir", lambda: tmp_path)
        monkeypatch.setattr(cli, "build_pdf_payload", lambda inv, items, cust, company, output_path: {"outputPath": output_path})
        calls = []

        def fake_sidecar(command, payload):
            calls.append((command, payload))
            return {"success": True, "xmlPath": payload["outputPath"]}

        monkeypatch.setattr(cli, "call_sidecar", fake_sidecar)

        number, path = cli.export_xrechnung_for(con, 1)

        assert (number, path) == ("RE-2026-0001", str(tmp_path / "RE-2026-0001.xml"))
        assert calls == [("generate_xrechnung", {"outputPath": path})]

    def test_an_issued_invoice_takes_leitweg_id_and_email_from_the_live_customer(self, cli, con, monkeypatch, tmp_path):
        con.execute("INSERT INTO settings (id) VALUES (1)")
        con.execute("INSERT INTO customers (id, leitweg_id, email) VALUES (1, '04011000-1234512345-35', 'amt@bfb.de')")
        self.stub_invoice(cli, monkeypatch, "RE-2026-0001", buyer_reference=None, snapshot={"email": None})
        checked = []
        monkeypatch.setattr(cli, "missing_xrechnung_fields", lambda *args: checked.append(args) or [])
        monkeypatch.setattr(cli, "pdf_output_dir", lambda: tmp_path)
        sent = []
        monkeypatch.setattr(
            cli, "build_pdf_payload",
            lambda inv, items, cust, company, output_path: sent.append((inv["buyer_reference"], cust["email"])) or {},
        )
        monkeypatch.setattr(cli, "call_sidecar", lambda command, payload: {"success": True, "xmlPath": "x.xml"})

        cli.export_xrechnung_for(con, 1)

        assert sent == [("04011000-1234512345-35", "amt@bfb.de")]
        assert checked[0][0] == "04011000-1234512345-35"


class TestPdfLanguageDefault:
    def test_comes_from_the_settings_like_the_app(self, cli, con):
        assert create_draft(cli, con, {"default_pdf_language": "en"})["pdf_language"] == "en"

    def test_explicit_flag_wins_over_the_settings(self, cli, con):
        row = create_draft(cli, con, {"default_pdf_language": "en"}, pdf_language="de")
        assert row["pdf_language"] == "de"

    def test_falls_back_to_german_without_a_setting(self, cli, con):
        assert create_draft(cli, con)["pdf_language"] == "de"


class TestSkontoDefault:
    ACTIVE = {"default_skonto_active": 1, "default_skonto_percent": 3.0, "default_skonto_days": 10}

    def test_inactive_in_the_settings_means_no_skonto(self, cli, con):
        row = create_draft(cli, con, {"default_skonto_active": 0, "default_skonto_percent": 3.0})
        assert (row["skonto_percent"], row["skonto_days"]) == (None, None)

    def test_active_in_the_settings_is_applied_to_new_invoices(self, cli, con):
        row = create_draft(cli, con, self.ACTIVE)
        assert (row["skonto_percent"], row["skonto_days"]) == (3.0, 10)

    def test_flags_override_the_settings(self, cli, con):
        row = create_draft(cli, con, self.ACTIVE, skonto_percent=1.5, skonto_days=5)
        assert (row["skonto_percent"], row["skonto_days"]) == (1.5, 5)

    def test_a_single_flag_takes_the_other_value_from_the_settings(self, cli, con):
        row = create_draft(cli, con, self.ACTIVE, skonto_percent=1.5)
        assert (row["skonto_percent"], row["skonto_days"]) == (1.5, 10)

    def test_flags_work_without_active_settings(self, cli, con):
        row = create_draft(cli, con, skonto_percent=2.0, skonto_days=7)
        assert (row["skonto_percent"], row["skonto_days"]) == (2.0, 7)

    def test_no_skonto_opts_out_of_active_settings(self, cli, con):
        row = create_draft(cli, con, self.ACTIVE, no_skonto=True)
        assert (row["skonto_percent"], row["skonto_days"]) == (None, None)


class TestCurrency:
    def test_eur_invoice_keeps_its_total_as_eur_equivalent(self, cli, con):
        row = create_draft(cli, con)
        assert (row["currency"], row["exchange_rate"], row["eur_total_cent"]) == ("EUR", None, 11900)

    def test_foreign_invoice_stores_currency_rate_and_frozen_eur_total(self, cli, con):
        row = create_draft(cli, con, currency="USD", exchange_rate="1,0832")
        assert (row["currency"], row["exchange_rate"], row["eur_total_cent"]) == ("USD", "1,0832", 10986)

    def test_foreign_currency_is_shown_with_its_code(self, cli):
        assert cli.fmt_money(123456, "USD") == "1.234,56 USD"
        assert cli.fmt_money(123456, "EUR") == "1.234,56 €"
        assert cli.fmt_money(123456) == "1.234,56 €"

    def test_foreign_invoice_without_a_rate_is_rejected_before_anything_is_written(self, cli, monkeypatch):
        monkeypatch.setattr(cli, "connect", lambda: pytest.fail("must not open the database"))
        args = create_args(customer="1", items="Arbeit|1|Std|100", currency="USD", exchange_rate=None,
                           reverse_charge="none", issue=False, pdf=False)
        with pytest.raises(SystemExit, match="Wechselkurs erforderlich für USD"):
            cli.cmd_invoice_create(args)


class TestGeneratedPdfResetsValidation:
    def test_new_pdf_clears_the_validation_of_the_previous_one(self, cli, con, monkeypatch, tmp_path):
        con.execute("INSERT INTO settings (id) VALUES (1)")
        con.execute(
            "INSERT INTO invoices (number, status, pdf_path, last_validation_status, last_validated_at, "
            "last_validation_findings_count) VALUES ('RE-2026-0001', 'sent', ?, 'invalid', 1700000000, 3)",
            (str(tmp_path / "old.pdf"),),
        )
        new_pdf = str(tmp_path / "RE-2026-0001.pdf")
        monkeypatch.setattr(cli, "load_invoice_full", lambda con, invoice_id: (
            dict(con.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()), [], {},
        ))
        monkeypatch.setattr(cli, "pdf_output_dir", lambda: tmp_path)
        monkeypatch.setattr(cli, "archive_pdf_version", lambda *args, **kwargs: None)
        monkeypatch.setattr(cli, "build_pdf_payload", lambda *args, **kwargs: {})
        monkeypatch.setattr(cli, "call_sidecar", lambda command, payload: {"success": True, "pdfPath": new_pdf})

        cli.generate_pdf_for(con, 1)

        row = con.execute("SELECT * FROM invoices WHERE id = 1").fetchone()
        assert row["pdf_path"] == new_pdf
        assert (row["last_validation_status"], row["last_validated_at"], row["last_validation_findings_count"]) == (
            None, None, None,
        )
