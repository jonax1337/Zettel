"""End-to-end run of cli/zettel.py against a database built from the real migrations (no sidecar needed)."""
from __future__ import annotations

import importlib.util
import json
import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
CLI_PATH = ROOT / "cli" / "zettel.py"
MIGRATIONS_DIR = ROOT / "src" / "lib" / "db" / "migrations"
# Every variable the CLI derives its data, config and home directory from, on any platform.
APP_DIR_VARIABLES = {"APPDATA": "appdata", "XDG_CONFIG_HOME": "config", "XDG_DATA_HOME": "data", "HOME": "home"}

pytestmark = pytest.mark.skipif(
    sqlite3.sqlite_version_info < (3, 38), reason="column defaults use unixepoch() (SQLite 3.38+)"
)


def load_cli():
    previous, sys.dont_write_bytecode = sys.dont_write_bytecode, True
    try:
        spec = importlib.util.spec_from_file_location("zettel_cli_commands", CLI_PATH)
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
    finally:
        sys.dont_write_bytecode = previous
    return cli


class Env:
    def __init__(self, root: Path, monkeypatch):
        for variable, folder in APP_DIR_VARIABLES.items():
            monkeypatch.setenv(variable, str(root / folder))
        monkeypatch.setenv("PYTHONDONTWRITEBYTECODE", "1")
        for encoding_override in ("PYTHONIOENCODING", "PYTHONUTF8"):
            monkeypatch.delenv(encoding_override, raising=False)
        self.cli = load_cli()
        self.db = self.cli.resolve_db_path()
        # These tests issue and seal invoices: they must never reach the database of an installed Zettel.
        assert root in self.db.parents and root in self.cli.app_data_dir().parents
        self.db.parent.mkdir(parents=True)
        self.env = dict(os.environ)
        self.reset_db()

    def reset_db(self) -> None:
        self.db.unlink(missing_ok=True)
        con = sqlite3.connect(self.db)
        for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
            con.executescript(migration.read_text(encoding="utf-8"))
        con.execute("UPDATE settings SET company_name='Test', street='Str 1', postal_code='10115', city='Berlin', "
                    "vat_id='DE123456789', is_kleinunternehmer=0 WHERE id = 1")
        con.commit()
        con.close()

    def query(self, sql: str, *params):
        con = sqlite3.connect(self.db)
        try:
            return con.execute(sql, params).fetchall()
        finally:
            con.close()

    def execute(self, sql: str, *params) -> None:
        con = sqlite3.connect(self.db)
        try:
            con.execute(sql, params)
            con.commit()
        finally:
            con.close()

    def run_text(self, *args) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(CLI_PATH), *args], env=self.env,
                              capture_output=True, encoding="utf-8")

    def run(self, *args, ok: bool = True) -> dict:
        proc = self.run_text(*args, "--json")
        out = json.loads(proc.stdout)
        assert out["ok"] is ok, proc.stdout + proc.stderr
        assert proc.returncode == (0 if ok else 1)
        return out


@pytest.fixture
def env(tmp_path, monkeypatch):
    return Env(tmp_path, monkeypatch)


def test_expected_schema_matches_app():
    source = (ROOT / "src" / "lib" / "utils" / "schema-version.ts").read_text(encoding="utf-8")
    app_version = int(re.search(r"CURRENT_DB_SCHEMA_VERSION\s*=\s*(\d+)", source).group(1))
    cli_version = int(re.search(r"^EXPECTED_SCHEMA\s*=\s*(\d+)", CLI_PATH.read_text(encoding="utf-8"), re.M).group(1))
    assert cli_version == app_version


def test_full_flow_offer_to_paid_with_seal(env):
    customer = env.run("customer:create", "--name", "ACME GmbH", "--city", "Berlin")["customer"]
    assert customer["customerNumber"] == "K-0001"

    offer = env.run("offer:create", "--customer", "K-0001", "--items", "Beratung|2|Std|90|19")["offer"]
    assert offer["number"].startswith("AN-") and offer["totalCent"] == 21420
    env.run("offer:send", str(offer["id"]))
    env.run("offer:accept", str(offer["id"]))

    converted = env.run("offer:convert", str(offer["id"]))
    assert converted["reused"] is False and converted["invoice"]["status"] == "draft"
    invoice_id = converted["invoice"]["id"]
    again = env.run("offer:convert", str(offer["id"]))
    assert again["reused"] is True and again["invoice"]["id"] == invoice_id
    assert env.query("SELECT COUNT(*) FROM invoices")[0][0] == 1

    issued = env.run("invoice:issue", str(invoice_id))
    assert issued["number"].startswith("RE-")
    assert env.query("SELECT COUNT(*) FROM invoice_seals WHERE invoice_id = ?", invoice_id)[0][0] == 1

    # not overdue yet, so no reminder candidates
    assert env.run("invoices", "--overdue")["invoices"] == []
    env.run("invoice:paid", str(invoice_id))
    refusal = env.run("reminder:create", "--invoice", str(invoice_id), "--level", "1", ok=False)["error"]
    assert "nur für versendete oder teilbezahlte Rechnungen" in refusal


def test_json_output_is_utf8_whatever_the_code_page_of_the_pipe(env):
    name_outside_windows_1252 = "Żółć → GmbH"

    created = env.run("customer:create", "--name", name_outside_windows_1252)["customer"]

    assert created["name"] == name_outside_windows_1252
    missing = env.run("offer:create", "--customer", "Łódź AG", "--items", "X|1|Std|100|19", ok=False)["error"]
    assert "Kunde nicht gefunden: Łódź AG" in missing


def test_redirected_text_output_and_error_messages_are_utf8(env):
    name_outside_windows_1252 = "Żółć → GmbH"

    created = env.run_text("customer:create", "--name", name_outside_windows_1252)
    failed = env.run_text("offer:create", "--customer", "Łódź AG", "--items", "X|1|Std|100|19")

    assert name_outside_windows_1252 in created.stdout
    assert (failed.returncode, failed.stderr.strip()) == (
        1, "Kunde nicht gefunden: Łódź AG (siehe 'zettel-cli customers')",
    )


def test_converted_offer_with_skonto_gets_no_payment_terms_text(env):
    env.run("customer:create", "--name", "ACME GmbH")
    offer = env.run("offer:create", "--customer", "K-0001", "--items", "Beratung|2|Std|90|19",
                    "--skonto-percent", "2", "--skonto-days", "7")["offer"]

    env.run("offer:convert", str(offer["id"]))

    assert env.query("SELECT payment_terms, skonto_percent, skonto_days FROM invoices") == [(None, 2.0, 7)]


def test_invoice_create_still_writes_the_payment_terms_text(env):
    env.run("customer:create", "--name", "ACME GmbH")

    env.run("invoice:create", "--customer", "K-0001", "--items", "X|1|Std|100|19", "--payment-terms", "14")

    assert env.query("SELECT payment_terms FROM invoices") == [(env.cli.payment_terms_text(14),)]


def test_offer_validity_of_zero_days_is_kept(env):
    env.execute("UPDATE settings SET default_offer_validity_days = 0 WHERE id = 1")
    env.run("customer:create", "--name", "ACME GmbH")

    offer = env.run("offer:create", "--customer", "K-0001", "--items", "X|1|Std|100|19",
                    "--issue-date", "2026-03-20")["offer"]

    assert offer["validUntil"] == "2026-03-20"


@pytest.fixture
def sent_offer(env) -> int:
    env.run("customer:create", "--name", "ACME GmbH")
    offer = env.run("offer:create", "--customer", "K-0001", "--items", "X|1|Std|100|19")["offer"]
    env.run("offer:send", str(offer["id"]))
    return offer["id"]


def test_offer_transitions_only_from_the_statuses_the_app_allows(env, sent_offer):
    env.run("offer:convert", str(sent_offer))

    assert "'accepted' -> 'rejected' nicht erlaubt" in env.run("offer:reject", str(sent_offer), ok=False)["error"]
    assert "'accepted' -> 'sent' nicht erlaubt" in env.run("offer:send", str(sent_offer), ok=False)["error"]
    assert env.run("offer:accept", str(sent_offer))["changed"] is False
    assert env.query("SELECT status, rejected_at FROM offers") == [("accepted", None)]


def test_offer_transition_keeps_a_status_the_app_set_in_between(env, sent_offer, monkeypatch):
    fetch_offer = env.cli.fetch_offer

    def fetch_then_let_the_app_accept(con, offer_id):
        row = fetch_offer(con, offer_id)
        env.execute("UPDATE offers SET status = 'accepted' WHERE id = ?", offer_id)
        return row

    monkeypatch.setattr(env.cli, "fetch_offer", fetch_then_let_the_app_accept)
    reject = env.cli.offer_transition("rejected", "rejected_at", ("sent", "draft"))

    with pytest.raises(SystemExit, match="'accepted' -> 'rejected' nicht erlaubt"):
        reject(SimpleNamespace(id=sent_offer))

    assert env.query("SELECT status, rejected_at FROM offers") == [("accepted", None)]


def test_overdue_and_reminder(env):
    env.run("customer:create", "--name", "ACME GmbH")
    inv = env.run("invoice:create", "--customer", "K-0001", "--items", "X|1|Std|100|19",
                  "--issue-date", "2020-01-01", "--due-date", "2020-01-15", "--issue")["invoice"]
    overdue = env.run("invoices", "--overdue")["invoices"]
    assert [i["id"] for i in overdue] == [inv["id"]] and overdue[0]["reminderLevels"] == []

    reminder = env.run("reminder:create", "--invoice", str(inv["id"]), "--level", "2", "--fee", "5,00")["reminder"]
    assert reminder["originalTotalCent"] == 11900 and reminder["totalDueCent"] == 11900 + 500
    assert env.run("reminder:send", str(reminder["id"]))["reminder"]["status"] == "sent"
    assert env.run("reminder:send", str(reminder["id"]))["changed"] is False
    assert env.run("invoices", "--overdue")["invoices"][0]["reminderLevels"] == [2]


def test_reminder_claims_what_payments_and_credit_notes_leave_open(env):
    env.run("customer:create", "--name", "ACME GmbH")
    inv = env.run("invoice:create", "--customer", "K-0001", "--items", "X|1|Std|100|19",
                  "--issue-date", "2020-01-01", "--due-date", "2020-01-15", "--issue")["invoice"]
    env.execute("UPDATE invoices SET status = 'partial', amount_paid_cent = 5000 WHERE id = ?", inv["id"])
    env.execute(
        "INSERT INTO invoices (number, customer_id, issue_date, due_date, status, total, is_credit_note, "
        "corrects_invoice_id, currency) "
        "SELECT 'RE-STORNO-1', customer_id, issue_date, due_date, 'sent', -2000, 1, id, currency "
        "FROM invoices WHERE id = ?", inv["id"],
    )

    reminder = env.run("reminder:create", "--invoice", str(inv["id"]), "--level", "1", "--fee", "0")["reminder"]

    assert reminder["originalTotalCent"] == 11900 - 5000 - 2000
    assert reminder["totalDueCent"] == reminder["originalTotalCent"]


def test_idempotency_key_reuses_and_survives_only_for_same_record(env):
    env.run("customer:create", "--name", "ACME GmbH")
    args = ("invoice:create", "--customer", "K-0001", "--items", "X|1|Std|100|19", "--idempotency-key", "k1")
    first = env.run(*args)
    second = env.run(*args)
    assert second["reused"] is True and second["invoice"]["id"] == first["invoice"]["id"]
    assert env.query("SELECT COUNT(*) FROM invoices")[0][0] == 1

    # restore/wipe: an unrelated invoice now owns id 1 -> the stale key must not point at it
    env.reset_db()
    env.run("customer:create", "--name", "Other GmbH")
    other = env.run("invoice:create", "--customer", "K-0001", "--items", "Y|1|Std|50|19", "--idempotency-key", "k2")
    env.execute("UPDATE invoices SET created_at = created_at + 1000 WHERE id = ?", other["invoice"]["id"])
    fresh = env.run(*args)
    assert fresh["reused"] is False and fresh["invoice"]["id"] != other["invoice"]["id"]
    assert env.query("SELECT COUNT(*) FROM invoices")[0][0] == 2


def test_json_error_envelope_and_schema_guard(env):
    assert env.run("invoice:show", "99", ok=False)["error"] == "Rechnung 99 nicht gefunden."
    con = sqlite3.connect(env.db)
    con.execute("PRAGMA user_version = 31")
    con.close()
    err = env.run("customers", ok=False)["error"]
    assert "Schema-Version 31" in err and "nichts geschrieben" in err
    assert env.run("status")["compatible"] is False


FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "invoice-parity.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", FIXTURE["totals"], ids=lambda c: c["name"])
def test_offer_totals_match_shared_parity_fixture(case):
    cli = load_cli()
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
        con.executescript(migration.read_text(encoding="utf-8"))
    con.execute("INSERT INTO customers (id, customer_number, name, city) VALUES (1, 'K-0001', 'Acme', 'Berlin')")
    con.execute("UPDATE settings SET is_kleinunternehmer = ? WHERE id = 1", (int(case["isKleinunternehmer"]),))
    args = type("A", (), dict(
        customer="1", reverse_charge="intra_eu" if case["isReverseCharge"] else "none", issue_date=None,
        valid_until=None, service_start=None, service_end=None, skonto_percent=None, skonto_days=None,
        no_skonto=True, pdf_language=None, supply_kind="services", notes=None, intro_text=None,
        currency="EUR", exchange_rate=None,
    ))()
    items = [{"description": "x", "unit": "Std", **i} for i in case["items"]]
    offer_id = cli.create_offer(con, args, items)
    row = con.execute("SELECT subtotal, vat_amount, total FROM offers WHERE id = ?", (offer_id,)).fetchone()
    assert dict(row) == {"subtotal": case["expected"]["subtotal"], "vat_amount": case["expected"]["vatAmount"],
                         "total": case["expected"]["total"]}
