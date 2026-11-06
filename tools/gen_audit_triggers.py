"""Prints the GoBD audit triggers for the audited tables, as SQL for a migration.

The triggers name every column explicitly, so a migration that adds a column
to an audited table must drop and recreate that table's triggers. Apply all
migrations up to and including the new column first, then run

    python tools/gen_audit_triggers.py [table ...]

and paste the output into the migration, preceded by DROP TRIGGER statements
for the replaced triggers. A Vitest guard (`audit-log.test.ts`) fails while a
column is missing from its table's triggers.
"""

import glob
import sqlite3
import sys
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parent.parent / "src" / "lib" / "db" / "migrations"

# Audited table -> column holding the id of the document the row belongs to.
AUDITED_TABLES: dict[str, str | None] = {
    "invoices": None,
    "invoice_items": "invoice_id",
    "invoice_payments": "invoice_id",
    "reminders": "invoice_id",
    "expenses": None,
    "expense_items": "expense_id",
    "customers": None,
    "vendors": None,
    "settings": None,
}

# Bookkeeping columns that change on every save or on a timer; the audit row
# has its own timestamp.
IGNORED_COLUMNS = {"updated_at", "last_auto_backup_at"}


def migrated_columns() -> dict[str, list[str]]:
    con = sqlite3.connect(":memory:")
    for path in sorted(glob.glob(str(MIGRATIONS / "*.sql"))):
        con.executescript(Path(path).read_text(encoding="utf-8"))
    return {
        table: [row[1] for row in con.execute(f"PRAGMA table_info({table})")
                if row[1] not in IGNORED_COLUMNS]
        for table in AUDITED_TABLES
    }


def values_of(columns: list[str], ref: str) -> str:
    rows = [f"SELECT '{c}' AS k, {ref}.{c} AS v" if i == 0 else f"SELECT '{c}', {ref}.{c}"
            for i, c in enumerate(columns)]
    return "\n      UNION ALL ".join(rows)


def changes_of(columns: list[str]) -> str:
    rows = [f"SELECT '{c}' AS k, OLD.{c} AS o, NEW.{c} AS n" if i == 0 else f"SELECT '{c}', OLD.{c}, NEW.{c}"
            for i, c in enumerate(columns)]
    return "\n      UNION ALL ".join(rows)


def snapshot_trigger(table: str, parent: str | None, columns: list[str], action: str) -> str:
    ref, event, target = ("NEW", "INSERT", "new_values") if action == "insert" else ("OLD", "DELETE", "old_values")
    parent_ref = f"{ref}.{parent}" if parent else "NULL"
    return (
        f"CREATE TRIGGER audit_{table}_{action} AFTER {event} ON {table}\nBEGIN\n"
        f"  INSERT INTO audit_log (table_name, row_id, parent_id, action, {target})\n"
        f"  SELECT '{table}', {ref}.id, {parent_ref}, '{action}', json_group_object(k, v)\n"
        f"  FROM (\n      {values_of(columns, ref)}\n  );\nEND;"
    )


def update_trigger(table: str, parent: str | None, columns: list[str]) -> str:
    changed = "\n   OR ".join(f"OLD.{c} IS NOT NEW.{c}" for c in columns)
    parent_ref = f"NEW.{parent}" if parent else "NULL"
    return (
        f"CREATE TRIGGER audit_{table}_update AFTER UPDATE ON {table}\nWHEN {changed}\nBEGIN\n"
        f"  INSERT INTO audit_log (table_name, row_id, parent_id, action, old_values, new_values)\n"
        f"  SELECT '{table}', NEW.id, {parent_ref}, 'update', json_group_object(k, o), json_group_object(k, n)\n"
        f"  FROM (\n      {changes_of(columns)}\n  )\n  WHERE o IS NOT n;\nEND;"
    )


def triggers_for(table: str, columns: list[str]) -> str:
    parent = AUDITED_TABLES[table]
    return "\n\n".join([
        snapshot_trigger(table, parent, columns, "insert"),
        update_trigger(table, parent, columns),
        snapshot_trigger(table, parent, columns, "delete"),
    ])


def main(tables: list[str]) -> None:
    unknown = [t for t in tables if t not in AUDITED_TABLES]
    if unknown:
        sys.exit(f"Nicht auditierte Tabelle(n): {', '.join(unknown)}")
    columns = migrated_columns()
    print("\n\n".join(triggers_for(t, columns[t]) for t in (tables or AUDITED_TABLES)))


if __name__ == "__main__":
    main(sys.argv[1:])
