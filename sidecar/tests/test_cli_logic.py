"""Business logic of cli/zettel.py, which must stay in step with src/lib/db/invoices.ts and src/lib/utils/."""
from __future__ import annotations

import importlib.util
import json
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

CLI_PATH = Path(__file__).resolve().parents[2] / "cli" / "zettel.py"


@pytest.fixture(scope="module")
def cli():
    # cli/ is not gitignored, so importing it must not leave a __pycache__ behind.
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec = importlib.util.spec_from_file_location("zettel_cli", CLI_PATH)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


class TestJsRound:
    @pytest.mark.parametrize(
        "value, expected",
        [(2.5, 3), (0.5, 1), (1.4, 1), (-1.4, -1), (-2.5, -2), (-0.5, 0)],
    )
    def test_matches_javascript_math_round(self, cli, value, expected):
        assert cli.js_round(value) == expected


class TestComputeTotals:
    def test_rounds_vat_per_line_like_the_app(self, cli):
        items = [
            {"quantity": 1, "unitPrice": 150, "vatRate": 19},
            {"quantity": 1, "unitPrice": 150, "vatRate": 19},
        ]
        totals = cli.compute_totals(items, False, False)
        assert totals == {"subtotal": 300, "vatAmount": 58, "total": 358}

    def test_no_vat_for_kleinunternehmer_or_reverse_charge(self, cli):
        items = [{"quantity": 2, "unitPrice": 5000, "vatRate": 19}]
        assert cli.compute_totals(items, True, False)["vatAmount"] == 0
        assert cli.compute_totals(items, False, True)["total"] == 10000


class TestDraftNumbers:
    def test_placeholder_is_recognised_and_masked(self, cli):
        placeholder = cli.draft_placeholder()
        assert cli.is_draft_number(placeholder)
        assert cli.display_number(placeholder, "draft") == f"Entwurf #{placeholder[6:10]}"

    def test_issued_number_is_shown_as_is(self, cli):
        assert cli.display_number("RE-2025-0001", "sent") == "RE-2025-0001"


class TestParseItems:
    def test_full_item(self, cli):
        (item,) = cli.parse_items_arg("Beratung|2,5|h|80,50|19|Langtext")
        assert item == {
            "description": "Beratung",
            "quantity": 2.5,
            "unit": "h",
            "unitPrice": 8050,
            "vatRate": 19,
            "longDescription": "Langtext",
        }

    def test_defaults_for_unit_and_vat(self, cli):
        (item,) = cli.parse_items_arg("Pauschale|1||100")
        assert (item["unit"], item["vatRate"], item["longDescription"]) == ("Std", 0, None)

    def test_multiple_items(self, cli):
        assert len(cli.parse_items_arg("A|1|Stk|1;B|2|Stk|2")) == 2

    def test_too_few_fields_exits(self, cli):
        with pytest.raises(SystemExit):
            cli.parse_items_arg("A|1|Stk")

    def test_non_numeric_price_exits_with_message_instead_of_traceback(self, cli):
        with pytest.raises(SystemExit):
            cli.parse_items_arg("A|1|Stk|viel")


INVOICE_SCHEMA = """
CREATE TABLE settings (
    id INTEGER PRIMARY KEY, invoice_number_counter INTEGER, invoice_number_format TEXT,
    updated_at INTEGER
);
INSERT INTO settings VALUES (1, 0, 'RE-{YYYY}-{NNNN}', 0);
CREATE TABLE customers (
    id INTEGER PRIMARY KEY, customer_number TEXT, name TEXT, contact_person TEXT, street TEXT,
    postal_code TEXT, city TEXT, country TEXT, email TEXT, vat_id TEXT
);
INSERT INTO customers (id, customer_number, name, city) VALUES (1, 'K-0001', 'Acme GmbH', 'Berlin');
CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT, customer_id INTEGER, customer_snapshot TEXT,
    issue_date INTEGER, delivery_date INTEGER, due_date INTEGER, status TEXT,
    subtotal INTEGER, vat_amount INTEGER, total INTEGER, is_kleinunternehmer INTEGER,
    is_reverse_charge INTEGER, reverse_charge_type TEXT, supply_kind TEXT, notes TEXT, payment_terms TEXT,
    is_credit_note INTEGER, corrects_invoice_id INTEGER, currency TEXT NOT NULL DEFAULT 'EUR', exchange_rate TEXT,
    eur_total_cent INTEGER, notes_internal TEXT, follow_up_date INTEGER,
    service_period_start INTEGER, service_period_end INTEGER, skonto_percent REAL,
    skonto_days INTEGER, pdf_language TEXT, pdf_path TEXT,
    amount_paid_cent INTEGER DEFAULT 0, sent_at INTEGER, paid_at INTEGER, updated_at INTEGER
);
CREATE TABLE invoice_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER, paid_at INTEGER,
    amount_cent INTEGER, source TEXT
);
"""

PAID_AT = 1_800_000_000
SECONDS_PER_DAY = 86_400


@pytest.fixture
def con():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(INVOICE_SCHEMA)
    yield connection
    connection.close()


class SharedConnection:
    """Context manager handing out the shared test connection without closing it."""

    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        return self.connection

    def __exit__(self, *exc):
        return False


def insert_invoice(con, *, status, total=11900, amount_paid=0, number="RE-2026-0001", issue_date=1_700_000_000):
    cur = con.execute(
        "INSERT INTO invoices (number, customer_id, customer_snapshot, status, total, amount_paid_cent, "
        "issue_date, due_date, is_credit_note) VALUES (?, 1, '{}', ?, ?, ?, ?, ?, 0)",
        (number, status, total, amount_paid, issue_date, issue_date),
    )
    if amount_paid:
        con.execute(
            "INSERT INTO invoice_payments (invoice_id, paid_at, amount_cent, source) VALUES (?, ?, ?, 'manual')",
            (cur.lastrowid, issue_date, amount_paid),
        )
    return cur.lastrowid


def payments_of(con, invoice_id):
    return [
        tuple(r)
        for r in con.execute(
            "SELECT paid_at, amount_cent, source FROM invoice_payments WHERE invoice_id = ?", (invoice_id,)
        )
    ]


def row_of(con, invoice_id):
    return con.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()


def local_timestamp(year, month, day, hour=12):
    return int(datetime(year, month, day, hour).timestamp())


class TestMarkPaid:
    def test_sent_invoice_logs_full_remainder_and_becomes_paid(self, cli, con):
        invoice_id = insert_invoice(con, status="sent")
        assert cli.mark_invoice_paid(con, invoice_id, PAID_AT) is not None
        assert payments_of(con, invoice_id) == [(PAID_AT, 11900, "auto")]
        invoice = row_of(con, invoice_id)
        assert (invoice["status"], invoice["amount_paid_cent"], invoice["paid_at"]) == ("paid", 11900, PAID_AT)

    def test_partial_invoice_logs_only_the_open_remainder(self, cli, con):
        invoice_id = insert_invoice(con, status="partial", amount_paid=4000)
        cli.mark_invoice_paid(con, invoice_id, PAID_AT)
        assert payments_of(con, invoice_id)[-1] == (PAID_AT, 7900, "auto")
        assert row_of(con, invoice_id)["amount_paid_cent"] == 11900

    def test_open_remainder_comes_from_the_recorded_payments_not_the_cached_amount(self, cli, con):
        invoice_id = insert_invoice(con, status="partial", amount_paid=4000)
        con.execute("UPDATE invoices SET amount_paid_cent = 0 WHERE id = ?", (invoice_id,))
        cli.mark_invoice_paid(con, invoice_id, PAID_AT)
        assert payments_of(con, invoice_id)[-1] == (PAID_AT, 7900, "auto")

    def test_overpayment_stays_visible_in_the_paid_amount(self, cli, con):
        invoice_id = insert_invoice(con, status="partial", amount_paid=12500)
        cli.mark_invoice_paid(con, invoice_id, PAID_AT)
        assert len(payments_of(con, invoice_id)) == 1
        assert row_of(con, invoice_id)["amount_paid_cent"] == 12500

    @pytest.mark.parametrize("status", ["cancelled", "paid"])
    def test_cancelled_or_paid_invoice_is_left_untouched(self, cli, con, status):
        invoice_id = insert_invoice(con, status=status)
        assert cli.mark_invoice_paid(con, invoice_id, PAID_AT) is None
        assert payments_of(con, invoice_id) == []
        invoice = row_of(con, invoice_id)
        assert (invoice["status"], invoice["amount_paid_cent"]) == (status, 0)

    @staticmethod
    def add_credit_note(con, invoice_id, status, total=-11900):
        con.execute(
            "INSERT INTO invoices (number, customer_id, customer_snapshot, status, total, is_credit_note, "
            "corrects_invoice_id) VALUES ('RE-2026-0099', 1, '{}', ?, ?, 1, ?)",
            (status, total, invoice_id),
        )

    @pytest.mark.parametrize("status", ["sent", "paid"])
    def test_invoice_offset_by_an_issued_credit_note_is_refused(self, cli, con, status):
        invoice_id = insert_invoice(con, status="sent")
        self.add_credit_note(con, invoice_id, status)
        with pytest.raises(SystemExit, match="Stornorechnung"):
            cli.mark_invoice_paid(con, invoice_id, PAID_AT)
        assert payments_of(con, invoice_id) == []
        assert row_of(con, invoice_id)["status"] == "sent"

    @pytest.mark.parametrize("status", ["draft", "cancelled"])
    def test_draft_or_discarded_credit_note_does_not_block_payment(self, cli, con, status):
        invoice_id = insert_invoice(con, status="sent")
        self.add_credit_note(con, invoice_id, status)
        assert cli.mark_invoice_paid(con, invoice_id, PAID_AT) is not None
        assert row_of(con, invoice_id)["status"] == "paid"
        assert payments_of(con, invoice_id) == [(PAID_AT, 11900, "auto")]

    def test_partial_credit_note_leaves_the_rest_payable_and_books_exactly_it(self, cli, con):
        invoice_id = insert_invoice(con, status="partial", amount_paid=5000)
        self.add_credit_note(con, invoice_id, "sent", total=-3000)
        assert cli.mark_invoice_paid(con, invoice_id, PAID_AT) is not None
        assert payments_of(con, invoice_id)[-1] == (PAID_AT, 3900, "auto")
        invoice = row_of(con, invoice_id)
        assert (invoice["status"], invoice["amount_paid_cent"]) == ("paid", 8900)

    def test_payments_and_partial_credit_note_covering_the_total_are_settled(self, cli, con):
        invoice_id = insert_invoice(con, status="partial", amount_paid=8900)
        self.add_credit_note(con, invoice_id, "sent", total=-3000)
        with pytest.raises(SystemExit, match="Stornorechnung"):
            cli.mark_invoice_paid(con, invoice_id, PAID_AT)

    def test_draft_is_issued_with_a_real_number_before_payment(self, cli, con):
        invoice_id = insert_invoice(con, status="draft", number=cli.draft_placeholder())
        cli.mark_invoice_paid(con, invoice_id, PAID_AT)
        invoice = row_of(con, invoice_id)
        assert invoice["status"] == "paid"
        assert not cli.is_draft_number(invoice["number"])
        assert payments_of(con, invoice_id) == [(PAID_AT, 11900, "auto")]


class TestIssuedNumberUsesIssueDate:
    def issued_number(self, cli, con, issue_date, number_format="RE-{YYYY}-{NNNN}"):
        con.execute("UPDATE settings SET invoice_number_format = ?", (number_format,))
        invoice_id = insert_invoice(con, status="draft", number=cli.draft_placeholder(), issue_date=issue_date)
        return cli.issue_invoice(con, invoice_id)

    def test_year_and_month_come_from_the_issue_date_not_today(self, cli, con):
        number = self.issued_number(cli, con, local_timestamp(2024, 3, 15), "RE-{YYYY}{MM}-{NNNN}")
        assert number == "RE-202403-0001"

    def test_year_switches_at_local_midnight_of_new_year(self, cli, con):
        last_second = local_timestamp(2025, 1, 1, 0) - 1
        assert self.issued_number(cli, con, last_second) == "RE-2024-0001"
        assert self.issued_number(cli, con, local_timestamp(2025, 1, 1, 0)) == "RE-2025-0002"

    def test_format_without_date_placeholders_is_unchanged(self, cli, con):
        assert self.issued_number(cli, con, local_timestamp(2024, 3, 15), "K-{NNNN}") == "K-0001"


class TestIssueInvoice:
    def test_freezes_the_current_customer_data(self, cli, con):
        invoice_id = insert_invoice(con, status="draft", number=cli.draft_placeholder())
        cli.issue_invoice(con, invoice_id)
        snapshot = json.loads(row_of(con, invoice_id)["customer_snapshot"])
        assert (snapshot["name"], snapshot["city"]) == ("Acme GmbH", "Berlin")

    def test_issued_invoice_keeps_its_number_and_draws_none(self, cli, con):
        invoice_id = insert_invoice(con, status="sent", number="RE-2026-0007")
        assert cli.issue_invoice(con, invoice_id) == "RE-2026-0007"
        assert con.execute("SELECT invoice_number_counter FROM settings").fetchone()[0] == 0

    def test_lost_claim_returns_the_number_the_other_process_assigned(self, cli, con):
        invoice_id = insert_invoice(con, status="sent", number="RE-2026-0008")
        assert cli.number_issued_concurrently(con, invoice_id) == "RE-2026-0008"

    def test_lost_claim_refuses_to_report_a_placeholder_as_the_number(self, cli, con):
        invoice_id = insert_invoice(con, status="sent", number=cli.draft_placeholder())
        with pytest.raises(SystemExit, match="gerade ausgestellt"):
            cli.number_issued_concurrently(con, invoice_id)


MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "lib" / "db" / "migrations"


@pytest.mark.skipif(sqlite3.sqlite_version_info < (3, 38), reason="migrations use unixepoch() (SQLite 3.38+)")
class TestOnMigratedSchema:
    """The CLI against the real schema, after the migration that allowed 'partial'."""

    @pytest.fixture
    def app_db(self):
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
            connection.executescript(migration.read_text(encoding="utf-8"))
        connection.execute("INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme')")
        connection.commit()
        yield connection
        connection.close()

    def test_pays_off_a_partially_paid_invoice(self, cli, app_db):
        invoice_id = insert_invoice(app_db, status="sent", amount_paid=4000)
        app_db.execute("UPDATE invoices SET status = 'partial' WHERE id = ?", (invoice_id,))
        assert cli.mark_invoice_paid(app_db, invoice_id, PAID_AT) is not None
        invoice = row_of(app_db, invoice_id)
        assert (invoice["status"], invoice["amount_paid_cent"]) == ("paid", 11900)

    def test_issues_a_draft_with_a_reverse_charge_type(self, cli, app_db):
        invoice_id = insert_invoice(app_db, status="draft", number=cli.draft_placeholder())
        app_db.execute("UPDATE invoices SET reverse_charge_type = 'third_country' WHERE id = ?", (invoice_id,))
        number = cli.issue_invoice(app_db, invoice_id)
        assert number.startswith("RE-")
        assert row_of(app_db, invoice_id)["reverse_charge_type"] == "third_country"


class TestAddDaysUnix:
    def test_keeps_wall_clock_time_across_dst_changes(self, cli):
        start = local_timestamp(2026, 3, 1)
        for days in (30, 60, 240):
            assert datetime.fromtimestamp(cli.add_days_unix(start, days)).hour == 12

    @pytest.mark.skipif(not hasattr(time, "tzset"), reason="time.tzset is unavailable on Windows")
    def test_spring_forward_differs_from_fixed_86400_seconds(self, cli, monkeypatch):
        monkeypatch.setenv("TZ", "Europe/Berlin")
        time.tzset()
        try:
            start = local_timestamp(2026, 3, 20)
            expected = local_timestamp(2026, 4, 3)
            assert cli.add_days_unix(start, 14) == expected
            assert expected != start + 14 * SECONDS_PER_DAY
        finally:
            monkeypatch.undo()
            time.tzset()


class TestSkonto:
    @staticmethod
    def invoice(**overrides):
        base = {
            "total": 11900,
            "is_credit_note": 0,
            "skonto_percent": 2.0,
            "skonto_days": 10,
            "issue_date": local_timestamp(2026, 3, 25),
        }
        return {**base, **overrides}

    def test_deadline_counts_calendar_days(self, cli):
        assert cli.skonto_of(self.invoice())["deadlineUnix"] == local_timestamp(2026, 4, 4)

    @pytest.mark.parametrize(
        "total, percent, expected",
        [(1010, 2.5, 25), (3070, 2.5, 77), (3070, 2, 61), (3075, 2, 62), (10000, 2.5, 250)],
    )
    def test_discount_is_rounded_half_up_like_the_app(self, cli, total, percent, expected):
        assert cli.skonto_of(self.invoice(total=total, skonto_percent=percent))["discountCent"] == expected

    @pytest.mark.parametrize(
        "total, percent, expected",
        [(3000, 2.3, 69), (10000, 1.1, 110), (5800, 2.5, 145), (1000, 0.7, 7), (11900, 3.5, 417)],
    )
    def test_fractional_percent_is_exact(self, cli, total, percent, expected):
        assert cli.skonto_of(self.invoice(total=total, skonto_percent=percent))["discountCent"] == expected

    @pytest.mark.parametrize(
        "overrides",
        [
            {"skonto_percent": None},
            {"skonto_days": None},
            {"skonto_percent": 0},
            {"skonto_days": 0},
            {"total": 0},
            {"total": -11900},
            {"is_credit_note": 1},
        ],
    )
    def test_inactive_skonto_yields_nothing(self, cli, overrides):
        assert cli.skonto_of(self.invoice(**overrides)) is None


class TestStats:
    YEAR = 2026
    ISSUED = local_timestamp(2026, 3, 1)

    @staticmethod
    def add(con, **values):
        row = {
            "status": "sent", "issue_date": TestStats.ISSUED, "total": 0, "amount_paid_cent": 0,
            "eur_total_cent": None, "currency": "EUR", **values,
        }
        con.execute(
            "INSERT INTO invoices (status, issue_date, total, amount_paid_cent, eur_total_cent, currency) "
            "VALUES (:status, :issue_date, :total, :amount_paid_cent, :eur_total_cent, :currency)",
            row,
        )

    def test_open_balance_subtracts_payments(self, cli, con):
        self.add(con, status="partial", total=10_000, amount_paid_cent=4_000)
        self.add(con, status="sent", total=5_000)
        self.add(con, status="paid", total=7_000, amount_paid_cent=7_000)

        revenue, open_count, open_total = cli.compute_stats(con, self.YEAR)

        assert (open_count, open_total) == (2, 11_000)
        assert revenue == 22_000

    def test_foreign_currency_counts_in_eur(self, cli, con):
        self.add(con, total=11_900, eur_total_cent=11_000)

        revenue, _, open_total = cli.compute_stats(con, self.YEAR)

        assert revenue == 11_000
        assert open_total == 11_000

    def test_foreign_currency_open_balance_converts_the_paid_share(self, cli, con):
        self.add(con, status="partial", total=10_000, amount_paid_cent=2_500, eur_total_cent=9_200)

        _, _, open_total = cli.compute_stats(con, self.YEAR)

        assert open_total == 9_200 - 2_300

    def credit(self, con, invoice_id, total, status="sent", **values):
        self.add(con, status=status, total=total, **values)
        con.execute(
            "UPDATE invoices SET is_credit_note = 1, corrects_invoice_id = ? WHERE id = last_insert_rowid()",
            (invoice_id,),
        )

    def last_id(self, con):
        return con.execute("SELECT MAX(id) FROM invoices").fetchone()[0]

    def test_credit_note_in_another_currency_is_ignored(self, cli, con):
        self.add(con, total=10_000)
        invoice_id = self.last_id(con)
        self.credit(con, invoice_id, -10_000, currency="USD")

        _, open_count, open_total = cli.compute_stats(con, self.YEAR)

        assert (open_count, open_total) == (1, 10_000)

    def test_full_credit_note_removes_invoice_and_credit_note_from_open_receivables(self, cli, con):
        self.add(con, total=10_000)
        self.credit(con, self.last_id(con), -10_000)

        _, open_count, open_total = cli.compute_stats(con, self.YEAR)

        assert (open_count, open_total) == (0, 0)

    def test_partial_credit_note_keeps_the_remainder_open(self, cli, con):
        self.add(con, status="partial", total=10_000, amount_paid_cent=4_000)
        self.credit(con, self.last_id(con), -3_000)

        _, open_count, open_total = cli.compute_stats(con, self.YEAR)

        assert (open_count, open_total) == (1, 3_000)

    @pytest.mark.parametrize("status", ["draft", "cancelled"])
    def test_draft_or_cancelled_credit_note_is_ignored(self, cli, con, status):
        self.add(con, total=10_000)
        self.credit(con, self.last_id(con), -10_000, status=status)

        _, open_count, open_total = cli.compute_stats(con, self.YEAR)

        assert (open_count, open_total) == (1, 10_000)

    def test_drafts_cancelled_and_other_years_do_not_count_as_revenue(self, cli, con):
        self.add(con, status="draft", total=1_000)
        self.add(con, status="cancelled", total=2_000)
        self.add(con, status="paid", total=4_000, issue_date=local_timestamp(2025, 6, 1))

        revenue, open_count, _ = cli.compute_stats(con, self.YEAR)

        assert (revenue, open_count) == (0, 0)


class TestDraftDueDate:
    def test_due_date_is_payment_terms_in_calendar_days(self, cli, con):
        args = SimpleNamespace(
            issue_date="2026-03-20", due_date=None, delivery_date=None, payment_terms=14,
            reverse_charge="none", supply_kind="services", notes=None, service_start=None, service_end=None,
            skonto_percent=None, skonto_days=None, no_skonto=False, pdf_language="de",
            currency="EUR", exchange_rate=None,
        )
        customer = {
            "id": 1, "customer_number": "K-0001", "name": "A", "contact_person": None,
            "street": None, "postal_code": None, "city": None, "country": None,
            "email": None, "vat_id": None,
        }
        settings = {"default_payment_terms_days": 14, "is_kleinunternehmer": 0}
        totals = {"subtotal": 100, "vatAmount": 19, "total": 119}
        invoice_id = cli.insert_draft_invoice(con, args, customer, settings, totals, False)
        assert row_of(con, invoice_id)["due_date"] == local_timestamp(2026, 4, 3)


class TestInvoiceListYear:
    def test_year_filter_uses_local_calendar_year(self, cli, con, monkeypatch, capsys):
        shortly_after_local_new_year = local_timestamp(2026, 1, 1, hour=0) + 30 * 60
        insert_invoice(con, status="sent", number="RE-2026-0001", issue_date=shortly_after_local_new_year)
        monkeypatch.setattr(cli, "connect", lambda: SharedConnection(con))
        cli.cmd_invoice_list(SimpleNamespace(status=None, year=2026))
        assert "RE-2026-0001" in capsys.readouterr().out
