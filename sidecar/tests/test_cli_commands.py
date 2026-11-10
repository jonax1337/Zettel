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

import pytest

ROOT = Path(__file__).resolve().parents[2]
CLI_PATH = ROOT / "cli" / "zettel.py"
MIGRATIONS_DIR = ROOT / "src" / "lib" / "db" / "migrations"
APP_ID = "digital.laux.zettel"

pytestmark = pytest.mark.skipif(
    sqlite3.sqlite_version_info < (3, 38), reason="column defaults use unixepoch() (SQLite 3.38+)"
)


class Env:
    def __init__(self, root: Path):
        self.config = root / "config"
        self.db = self.config / APP_ID / "zettel.db"
        (root / "data" / APP_ID).mkdir(parents=True)
        self.db.parent.mkdir(parents=True)
        self.env = {**os.environ, "XDG_CONFIG_HOME": str(self.config), "XDG_DATA_HOME": str(root / "data"),
                    "HOME": str(root / "home"), "PYTHONDONTWRITEBYTECODE": "1"}
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

    def run(self, *args, ok: bool = True) -> dict:
        proc = subprocess.run([sys.executable, str(CLI_PATH), *args, "--json"], env=self.env,
                              capture_output=True, text=True)
        out = json.loads(proc.stdout)
        assert out["ok"] is ok, proc.stdout + proc.stderr
        assert proc.returncode == (0 if ok else 1)
        return out


@pytest.fixture
def env(tmp_path):
    return Env(tmp_path)


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
    env.run("reminder:create", "--invoice", str(invoice_id), "--level", "1", ok=False)


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
    con = sqlite3.connect(env.db)
    con.execute("UPDATE invoices SET created_at = created_at + 1000 WHERE id = ?", (other["invoice"]["id"],))
    con.commit()
    con.close()
    fresh = env.run(*args)
    assert fresh["reused"] is False and fresh["invoice"]["id"] != other["invoice"]["id"]
    assert env.query("SELECT COUNT(*) FROM invoices")[0][0] == 2


def test_json_error_envelope_and_schema_guard(env):
    assert "nicht gefunden" in env.run("invoice:show", "99", ok=False)["error"]
    con = sqlite3.connect(env.db)
    con.execute("PRAGMA user_version = 31")
    con.close()
    err = env.run("customers", ok=False)["error"]
    assert "Schema-Version 31" in err and "nichts geschrieben" in err
    assert env.run("status")["compatible"] is False


FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "invoice-parity.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", FIXTURE["totals"], ids=lambda c: c["name"])
def test_offer_totals_match_shared_parity_fixture(case):
    previous, sys.dont_write_bytecode = sys.dont_write_bytecode, True
    try:
        spec = importlib.util.spec_from_file_location("zettel_cli_offers", CLI_PATH)
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
    finally:
        sys.dont_write_bytecode = previous
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
