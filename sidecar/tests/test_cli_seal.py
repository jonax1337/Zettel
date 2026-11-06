"""Invoice hash chain of cli/zettel.py: the format shared with src/lib/db/seals.ts, and the CLI's writes on the real schema."""
from __future__ import annotations

import importlib.util
import json
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CLI_PATH = ROOT / "cli" / "zettel.py"
MIGRATIONS_DIR = ROOT / "src" / "lib" / "db" / "migrations"
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "invoice-seal.json"

# The app asserts the same file in src/lib/db/seals.test.ts.
FIXTURE = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
DOCUMENTS = {doc["name"]: doc for doc in FIXTURE["documents"]}

pytestmark = pytest.mark.skipif(
    sqlite3.sqlite_version_info < (3, 38), reason="migrations use unixepoch() (SQLite 3.38+)"
)


@pytest.fixture(scope="module")
def cli():
    # cli/ is not gitignored, so importing it must not leave a __pycache__ behind.
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec = importlib.util.spec_from_file_location("zettel_cli_seal", CLI_PATH)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


@pytest.fixture
def con():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
        connection.executescript(migration.read_text(encoding="utf-8"))
    connection.execute("INSERT INTO customers (id, customer_number, name, city) VALUES (1, 'K-0001', 'Acme GmbH', 'Berlin')")
    connection.commit()
    yield connection
    connection.close()


def insert_row(con, table: str, values: dict) -> int:
    columns = ", ".join(values)
    placeholders = ", ".join("?" for _ in values)
    return con.execute(f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", list(values.values())).lastrowid


def insert_fixture_invoice(con, doc: dict, status: str = "sent") -> int:
    invoice_id = insert_row(con, "invoices", {**doc["invoice"], "status": status})
    for item in doc["items"]:
        insert_row(con, "invoice_items", {**item, "invoice_id": invoice_id})
    return invoice_id


def insert_draft(con, cli) -> int:
    return insert_row(con, "invoices", {
        "number": cli.draft_placeholder(), "customer_id": 1, "customer_snapshot": "{}", "status": "draft",
        "issue_date": 1_767_225_600, "due_date": 1_768_435_200, "total": 11900, "subtotal": 10000, "vat_amount": 1900,
    })


def seals_of(con) -> list[sqlite3.Row]:
    return con.execute("SELECT * FROM invoice_seals ORDER BY id").fetchall()


def audit_rows(con, table: str, action: str) -> list[sqlite3.Row]:
    return con.execute(
        "SELECT * FROM audit_log WHERE table_name = ? AND action = ? ORDER BY id", (table, action)
    ).fetchall()


class TestSharedFixture:
    @pytest.mark.parametrize("doc", FIXTURE["documents"], ids=lambda d: d["name"])
    def test_canonical_document_and_content_hash(self, cli, doc):
        assert cli.canonical_seal_document(doc["invoice"], doc["items"]) == doc["canonical"]
        assert cli.seal_content_hash(doc["invoice"], doc["items"]) == doc["contentHash"]

    def test_chain_links(self, cli):
        for link in FIXTURE["chain"]:
            content_hash = DOCUMENTS[link["document"]]["contentHash"]
            hash_ = cli.seal_chain_hash(link["prevHash"], link["invoiceId"], link["kind"], link["sealedAt"], content_hash)
            assert hash_ == link["hash"]
        assert FIXTURE["chain"][0]["prevHash"] == cli.GENESIS_HASH
        assert FIXTURE["chain"][1]["prevHash"] == FIXTURE["chain"][0]["hash"]


class TestSealFromDatabase:
    def test_stored_values_hash_like_the_fixture(self, cli, con):
        """REAL columns come back as 1.0 / 2.0 and must hash like the app's integers."""
        for doc in FIXTURE["documents"]:
            invoice_id = insert_fixture_invoice(con, doc)
            cli.append_seal(con, invoice_id, "issue")

        assert [row["content_hash"] for row in seals_of(con)] == [doc["contentHash"] for doc in FIXTURE["documents"]]

    def test_each_seal_covers_the_previous_one(self, cli, con):
        first, second = (insert_fixture_invoice(con, doc) for doc in FIXTURE["documents"][:2])
        cli.append_seal(con, first, "issue")
        cli.append_seal(con, second, "issue")

        one, two = seals_of(con)

        assert one["prev_hash"] == cli.GENESIS_HASH
        assert two["prev_hash"] == one["hash"]
        for seal in (one, two):
            expected = cli.seal_chain_hash(seal["prev_hash"], seal["invoice_id"], seal["kind"], seal["sealed_at"], seal["content_hash"])
            assert seal["hash"] == expected


class TestIssueInvoiceSeals:
    def test_issuing_appends_an_issue_seal_of_the_final_content(self, cli, con):
        invoice_id = insert_draft(con, cli)

        number = cli.issue_invoice(con, invoice_id)

        (seal,) = seals_of(con)
        invoice, items, _ = cli.load_invoice_full(con, invoice_id)
        assert (seal["invoice_id"], seal["kind"], seal["prev_hash"]) == (invoice_id, "issue", cli.GENESIS_HASH)
        assert invoice["number"] == number
        assert seal["content_hash"] == cli.seal_content_hash(invoice, items)

    def test_the_content_hash_includes_the_number_assigned_while_issuing(self, cli, con):
        invoice_id = insert_draft(con, cli)
        placeholder_hash = cli.seal_content_hash(*cli.load_invoice_full(con, invoice_id)[:2])

        cli.issue_invoice(con, invoice_id)

        assert seals_of(con)[0]["content_hash"] != placeholder_hash

    def test_an_already_issued_invoice_gets_no_second_seal(self, cli, con):
        invoice_id = insert_draft(con, cli)
        cli.issue_invoice(con, invoice_id)

        cli.issue_invoice(con, invoice_id)

        assert len(seals_of(con)) == 1

    def test_a_failed_seal_does_not_undo_the_issue(self, cli, con, capsys):
        invoice_id = insert_draft(con, cli)
        con.executescript("DROP TRIGGER invoice_seals_no_update; DROP TRIGGER invoice_seals_no_delete; DROP TABLE invoice_seals;")

        number = cli.issue_invoice(con, invoice_id)

        invoice = con.execute("SELECT number, status FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
        assert (invoice["number"], invoice["status"]) == (number, "sent")
        assert "konnte nicht versiegelt werden" in capsys.readouterr().err

    def test_a_seal_appended_concurrently_makes_the_cli_read_the_chain_again(self, cli, con):
        invoice_id = insert_draft(con, cli)
        competing = {"invoice_id": 99, "kind": "issue", "sealed_at": 1, "content_hash": "c",
                     "prev_hash": cli.GENESIS_HASH, "hash": "competitor"}

        class RacingConnection:
            raced = False

            def execute(self, sql, params=()):
                if not self.raced and "INSERT INTO invoice_seals" in sql:
                    self.raced = True
                    insert_row(con, "invoice_seals", competing)
                return con.execute(sql, params)

            def commit(self):
                con.commit()

        cli.append_seal(RacingConnection(), invoice_id, "issue")

        assert [(s["invoice_id"], s["prev_hash"]) for s in seals_of(con)] == [
            (99, cli.GENESIS_HASH),
            (invoice_id, "competitor"),
        ]

    def test_gives_up_after_three_collisions(self, cli, con):
        invoice_id = insert_draft(con, cli)
        attempts = []

        class AlwaysRacing:
            def execute(self, sql, params=()):
                if "INSERT INTO invoice_seals" in sql:
                    attempts.append(sql)
                    last = con.execute("SELECT hash FROM invoice_seals ORDER BY id DESC LIMIT 1").fetchone()
                    insert_row(con, "invoice_seals", {
                        "invoice_id": 99, "kind": "issue", "sealed_at": 1, "content_hash": "c",
                        "prev_hash": last[0] if last else cli.GENESIS_HASH, "hash": f"competitor-{len(attempts)}",
                    })
                return con.execute(sql, params)

        with pytest.raises(sqlite3.IntegrityError):
            cli.append_seal(AlwaysRacing(), invoice_id, "issue")

        assert len(attempts) == cli.SEAL_APPEND_ATTEMPTS


class TestCliWritesAreAudited:
    def test_issuing_logs_the_status_change_and_the_final_number(self, cli, con):
        invoice_id = insert_draft(con, cli)

        number = cli.issue_invoice(con, invoice_id)

        changes = [json.loads(row["new_values"]) for row in audit_rows(con, "invoices", "update") if row["row_id"] == invoice_id]
        assert {"status": "sent"}.items() <= changes[0].items()
        assert changes[-1] == {"number": number}

    def test_payments_and_items_are_logged_with_their_invoice(self, cli, con):
        invoice_id = insert_draft(con, cli)
        cli.insert_invoice_items(con, invoice_id, [
            {"description": "Beratung", "quantity": 1.5, "unit": "h", "unitPrice": 10000, "vatRate": 19},
        ])
        cli.issue_invoice(con, invoice_id)

        cli.mark_invoice_paid(con, invoice_id, 1_800_000_000)

        (item,) = audit_rows(con, "invoice_items", "insert")
        (payment,) = audit_rows(con, "invoice_payments", "insert")
        assert item["parent_id"] == payment["parent_id"] == invoice_id
        assert json.loads(item["new_values"])["description"] == "Beratung"
        assert json.loads(payment["new_values"])["amount_cent"] == 11900
        assert {"status": "paid"}.items() <= json.loads(audit_rows(con, "invoices", "update")[-1]["new_values"]).items()
