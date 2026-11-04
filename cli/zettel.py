#!/usr/bin/env python3
"""
Zettel CLI — headless Steuerung der Zettel-Datenbank.

Repliziert die App-Geschäftslogik aus src/lib/db/invoices.ts exakt:
  - Draft-Placeholder `DRAFT-<hex>` (kein Nummern-Slot wird verbrannt)
  - Lazy Invoice-Numbering: echte Nummer erst bei issue/markSent/PDF
  - computeTotals: Per-Line-Rundung (Finanzamt-Konvention), Cent-Integer
  - markPaid protokolliert Restbetrag als invoice_payments-Eintrag
  - PDF-Generierung über den Sidecar (JSON-RPC über stdin/stdout)

DB-Auswahl folgt derselben Quelle der Wahrheit wie die App:
  sandbox.flag vorhanden  -> zettel-sandbox.db
  sonst aktiver Tenant    -> dessen Pfad aus tenants.json
  sonst                   -> zettel.db (Standard)

Nur stdlib — bewusst ohne externe Abhängigkeiten.

Warnung: Nicht parallel zur laufenden Zettel-App mit schreibendem Zugriff
verwenden (SQLite single-writer). Lesende Befehle sind unproblematisch.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterator

APP_IDENTIFIER = "digital.laux.zettel"
DEFAULT_PAYMENT_TERMS_DAYS = 14
DEFAULT_UNIT = "Std"
DEFAULT_PDF_PROFILE = "en16931"
DEFAULT_PDF_THEME = "classic"
DEFAULT_PDF_LANGUAGE = "de"
PAYABLE_STATUSES = ("sent", "partial")
DRAFT_PREFIX = "DRAFT-"
DRAFT_TOKEN_LENGTH = 16
DRAFT_DISPLAY_LENGTH = 4
DATE_INPUT_FORMATS = ("%Y-%m-%d", "%d.%m.%Y")
NOON_HOUR = 12
SIDECAR_TIMEOUT_SECONDS = 300
ERROR_TAIL_CHARS = 2000
ERROR_DETAIL_CHARS = 800
MIN_ITEM_FIELDS = 4
CENTS_PER_EUR = 100
BASE_CURRENCY = "EUR"
# Spiegel von SUPPORTED_CURRENCIES in src/lib/utils/currency.ts
SUPPORTED_CURRENCIES = ("EUR", "USD", "GBP", "CHF", "AUD", "CAD", "JPY", "NOK", "SEK", "DKK", "PLN", "CZK")
RATE_FRACTION_DIGITS = 8
RATE_SCALE = 10**RATE_FRACTION_DIGITS
DEFAULT_SKONTO_PERCENT = 2.0
DEFAULT_SKONTO_DAYS = 7
# unixepoch() needs SQLite 3.38+; older Python builds ship an older SQLite.
SQL_NOW = "CAST(strftime('%s', 'now') AS INTEGER)"

# ----------------------------------------------------------------------------
# DB-Auflösung (Spiegel von src-tauri/src/tenants.rs)
# ----------------------------------------------------------------------------


def app_data_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / APP_IDENTIFIER


def is_sandbox_active() -> bool:
    return (app_data_dir() / "sandbox.flag").exists()


def active_custom_tenant() -> dict | None:
    """Aktiver Tenant mit DB-Pfad, None für den eingebauten Standard."""
    cfg_path = app_data_dir() / "tenants.json"
    if not cfg_path.exists():
        return None
    try:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    active = cfg.get("active")
    if not active or active == "default":
        return None
    for t in cfg.get("tenants", []):
        if t.get("id") == active and str(t.get("path", "")).strip():
            return t
    return None


def resolve_db_path() -> Path:
    """Aktive DB: Sandbox > aktiver Tenant > Standard. Wie resolve_active_url()."""
    if is_sandbox_active():
        return app_data_dir() / "zettel-sandbox.db"
    tenant = active_custom_tenant()
    if tenant:
        return Path(tenant["path"])
    return app_data_dir() / "zettel.db"


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    path = resolve_db_path()
    if not path.exists():
        sys.exit(f"Fehler: Datenbank nicht gefunden: {path}")
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        yield con
    finally:
        con.close()


# ----------------------------------------------------------------------------
# Geschäftslogik (Spiegel von src/lib/utils/totals.ts + invoices.ts)
# ----------------------------------------------------------------------------


def js_round(v: float) -> int:
    """Math.round wie in JS: .5 rundet Richtung +unendlich (Pythons round() ist banker's)."""
    return math.floor(v + 0.5)


def compute_line_total(quantity: float, unit_price_cent: int) -> int:
    return js_round(quantity * unit_price_cent)


def compute_totals(items: list[dict], is_kleinunternehmer: bool, is_reverse_charge: bool) -> dict:
    vat_exempt = is_kleinunternehmer or is_reverse_charge
    subtotal = 0
    vat_amount = 0
    for it in items:
        line = compute_line_total(it["quantity"], it["unitPrice"])
        subtotal += line
        if not vat_exempt:
            vat_amount += js_round(line * it["vatRate"] / 100)
    return {"subtotal": subtotal, "vatAmount": vat_amount, "total": subtotal + vat_amount}


def parse_exchange_rate_scaled(text: str | None) -> int | None:
    """Spiegel von parseExchangeRateScaled(): "1,0832" -> Rate * 1e8, None bei ungültig/nicht positiv."""
    if not text:
        return None
    normalized = text.strip().replace(",", ".", 1)
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", normalized):
        return None
    whole, _, fraction = normalized.partition(".")
    scaled = int(whole + fraction.ljust(RATE_FRACTION_DIGITS, "0")[:RATE_FRACTION_DIGITS])
    return scaled if scaled > 0 else None


def to_eur_cents(total_cent: int, rate_scaled: int) -> int:
    """Spiegel von toEurCents(): "1 EUR = X Fremdwährung", half-up auf dem Betrag, Vorzeichen bleibt."""
    numerator = abs(total_cent) * RATE_SCALE
    quotient, remainder = divmod(numerator, rate_scaled)
    rounded = quotient + 1 if remainder * 2 >= rate_scaled else quotient
    return -rounded if total_cent < 0 else rounded


def compute_eur_total_cent(currency: str, total_cent: int, exchange_rate: str | None) -> int | None:
    """Spiegel von computeEurTotalCent(): None bei Fremdwährung ohne gültigen Kurs."""
    if currency == BASE_CURRENCY:
        return total_cent
    rate_scaled = parse_exchange_rate_scaled(exchange_rate)
    return None if rate_scaled is None else to_eur_cents(total_cent, rate_scaled)


def payment_terms_text(days: int) -> str:
    """Spiegel von defaultPaymentTermsText() in src/lib/utils/payment-terms.ts."""
    return f"Zahlbar innerhalb von {days} Tagen ohne Abzug."


def resolve_skonto(args, settings: dict) -> tuple[float | None, int | None]:
    """Wie ein neues Rechnungsformular: Skonto-Voreinstellung aus den Settings, explizite Flags gewinnen."""
    if args.no_skonto:
        return None, None
    if args.skonto_percent is not None or args.skonto_days is not None:
        percent = args.skonto_percent if args.skonto_percent is not None else settings.get("default_skonto_percent")
        days = args.skonto_days if args.skonto_days is not None else settings.get("default_skonto_days")
        return (
            DEFAULT_SKONTO_PERCENT if percent is None else percent,
            DEFAULT_SKONTO_DAYS if days is None else days,
        )
    if settings.get("default_skonto_active"):
        return (
            settings.get("default_skonto_percent") or DEFAULT_SKONTO_PERCENT,
            settings.get("default_skonto_days") or DEFAULT_SKONTO_DAYS,
        )
    return None, None


def format_invoice_number(pattern: str, counter: int, dt: datetime) -> str:
    yyyy = str(dt.year)
    yy = yyyy[2:]
    mm = str(dt.month).zfill(2)
    return (
        pattern.replace("{YYYY}", yyyy)
        .replace("{YY}", yy)
        .replace("{MM}", mm)
        .replace("{NNNN}", str(counter).zfill(4))
        .replace("{NNN}", str(counter).zfill(3))
        .replace("{NN}", str(counter).zfill(2))
        .replace("{N}", str(counter))
    )


def draft_placeholder() -> str:
    return f"{DRAFT_PREFIX}{uuid.uuid4().hex[:DRAFT_TOKEN_LENGTH]}"


def is_draft_number(n: str | None) -> bool:
    return bool(n) and n.startswith(DRAFT_PREFIX)


def display_number(number: str, status: str) -> str:
    if status == "draft" and is_draft_number(number):
        token = number[len(DRAFT_PREFIX):][:DRAFT_DISPLAY_LENGTH]
        return f"Entwurf #{token}"
    return number


def now_unix() -> int:
    return int(time.time())


def parse_date(s: str | None) -> int | None:
    """Akzeptiert YYYY-MM-DD / TT.MM.JJJJ (lokal, 12:00 Uhr) oder Unix-Timestamp."""
    if not s:
        return None
    s = s.strip()
    if s.isdigit():
        return int(s)
    for fmt in DATE_INPUT_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            return int(datetime(dt.year, dt.month, dt.day, NOON_HOUR).timestamp())
        except ValueError:
            continue
    sys.exit(f"Ungültiges Datum: {s} (erwartet YYYY-MM-DD oder TT.MM.JJJJ)")


def add_days_unix(unix_seconds: int, days: int) -> int:
    """Kalendertage in lokaler Zeit (wie addDaysUnix), damit die Uhrzeit DST-Wechsel überlebt."""
    shifted = datetime.fromtimestamp(unix_seconds) + timedelta(days=days)
    return int(shifted.timestamp())


def fmt_money(cent, currency: str | None = None) -> str:
    """Betrag in der Belegwährung; EUR bleibt "1.234,56 €"."""
    if cent is None:
        return "—"
    code = currency or BASE_CURRENCY
    amount = f"{cent / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{amount} {'€' if code == BASE_CURRENCY else code}"


def fmt_eur(cent) -> str:
    return fmt_money(cent)


def fmt_date(unix) -> str:
    if not unix:
        return "—"
    return datetime.fromtimestamp(unix).strftime("%d.%m.%Y")


# ----------------------------------------------------------------------------
# Sidecar-Integration (JSON-RPC wie src-tauri/src/sidecar.rs)
# ----------------------------------------------------------------------------


SIDECAR_SEARCH_PATHS = [
    # installierte App (NSIS user-scope) — der Normalfall
    Path.home() / "AppData" / "Local" / "Zettel" / "sidecar" / "zettel-sidecar.exe",
    Path.home() / "AppData" / "Local" / "Programs" / "Zettel" / "sidecar" / "zettel-sidecar.exe",
    Path.home() / "AppData" / "Local" / "zettel" / "sidecar" / "zettel-sidecar.exe",
    # Dev-Repo-Venv (Fallback)
    Path(__file__).resolve().parent.parent / "sidecar" / ".venv" / "Scripts" / "python.exe",
    Path(__file__).resolve().parent.parent / "sidecar" / ".venv" / "bin" / "python",
]


def resolve_sidecar() -> tuple[str | None, str | None]:
    """(exe, None) für ein Standalone-Binary (bevorzugt: installierte App)
    oder (python, main.py) für das Dev-Venv im Repo."""
    env = os.environ.get("ZETTEL_SIDECAR")
    if env:
        p = Path(env)
        if p.is_file():
            if p.suffix.lower() == ".exe":
                return str(p), None
            return str(p), str(_find_main_py())
    repo_root = Path(__file__).resolve().parent.parent
    main_py = repo_root / "sidecar" / "main.py"
    for cand in SIDECAR_SEARCH_PATHS:
        if not cand.is_file():
            continue
        if cand.suffix.lower() == ".exe":
            return str(cand), None
        # Dev-Venv braucht main.py daneben
        if main_py.is_file():
            return str(cand), str(main_py)
    return None, None


def _find_main_py() -> str:
    repo_root = Path(__file__).resolve().parent.parent
    main_py = repo_root / "sidecar" / "main.py"
    if not main_py.is_file():
        sys.exit("sidecar/main.py nicht gefunden (Repo-Pfad?).")
    return str(main_py)


def call_sidecar(command: str, payload: dict) -> dict:
    exe, main_py = resolve_sidecar()
    if not exe:
        sys.exit(
            "Kein Sidecar verfügbar. Dev: sidecar/.venv anlegen. "
            "Release: ZETTEL_SIDECAR auf zettel-sidecar.exe setzen."
        )
    cmd = [exe] if main_py is None else [exe, main_py]
    req = json.dumps({"command": command, "payload": payload})
    proc = subprocess.run(
        cmd,
        input=req,
        capture_output=True,
        text=True,
        timeout=SIDECAR_TIMEOUT_SECONDS,
        cwd=str(Path(main_py).parent) if main_py else None,
    )
    if proc.returncode != 0:
        sys.exit(f"Sidecar-Fehler (exit {proc.returncode}):\n{proc.stderr[-ERROR_TAIL_CHARS:]}")
    try:
        return json.loads(proc.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        sys.exit(
            f"Sidecar-Antwort nicht parsebar:\n{proc.stdout[-ERROR_TAIL_CHARS:]}\n{proc.stderr[-ERROR_TAIL_CHARS:]}"
        )


# ----------------------------------------------------------------------------
# PDF-Payload-Bau (Spiegel von src/lib/sidecar/invoice.ts buildPayload)
# ----------------------------------------------------------------------------


def skonto_of(inv: dict) -> dict | None:
    percent = inv.get("skonto_percent") or 0
    days = inv.get("skonto_days") or 0
    if inv["is_credit_note"] or inv["total"] <= 0 or percent <= 0 or days <= 0:
        return None
    return {
        "percent": percent,
        "days": days,
        "discountCent": inv["total"] * js_round(percent * 100) // 10000,
        "deadlineUnix": add_days_unix(inv["issue_date"] or now_unix(), days),
    }


def build_pdf_payload(inv: dict, items: list[dict], customer: dict, company: dict, output_path: str) -> dict:
    skonto = skonto_of(inv)
    return {
        "invoice": {
            "number": inv["number"],
            "issueDate": inv["issue_date"],
            "deliveryDate": inv["delivery_date"],
            "dueDate": inv["due_date"],
            "subtotal": inv["subtotal"],
            "vatAmount": inv["vat_amount"],
            "total": inv["total"],
            "isKleinunternehmer": bool(inv["is_kleinunternehmer"]),
            "isReverseCharge": bool(inv["is_reverse_charge"]),
            "reverseChargeType": inv["reverse_charge_type"],
            "supplyKind": inv["supply_kind"],
            "isCreditNote": bool(inv["is_credit_note"]),
            "correctsInvoice": None,
            "notes": inv["notes"],
            "paymentTerms": inv["payment_terms"],
            "currency": inv["currency"] or "EUR",
            "exchangeRate": inv["exchange_rate"],
            "eurTotalCent": inv["eur_total_cent"],
            "servicePeriodStart": inv["service_period_start"],
            "servicePeriodEnd": inv["service_period_end"],
            "skontoPercent": skonto["percent"] if skonto else None,
            "skontoDays": skonto["days"] if skonto else None,
            "skontoAmountCent": skonto["discountCent"] if skonto else None,
            "skontoDeadline": skonto["deadlineUnix"] if skonto else None,
            "amountPaidCent": inv["amount_paid_cent"] or 0,
            "pdfLanguage": inv["pdf_language"] or DEFAULT_PDF_LANGUAGE,
        },
        "items": [
            {
                "position": it["position"],
                "description": it["description"],
                "quantity": it["quantity"],
                "unit": it["unit"],
                "unitPrice": it["unit_price"],
                "vatRate": it["vat_rate"],
                "lineTotal": it["line_total"],
                "longDescription": it["long_description"],
                "linePeriodStart": it["line_period_start"],
                "linePeriodEnd": it["line_period_end"],
            }
            for it in items
        ],
        "company": {
            "companyName": company["company_name"],
            "ownerName": company["owner_name"],
            "street": company["street"],
            "postalCode": company["postal_code"],
            "city": company["city"],
            "country": company["country"],
            "taxNumber": company["tax_number"],
            "vatId": company["vat_id"],
            "email": company["email"],
            "phone": company["phone"],
            "website": company["website"],
            "bankName": company["bank_name"],
            "bankIban": company["bank_iban"],
            "bankBic": company["bank_bic"],
            "isKleinunternehmer": bool(company["is_kleinunternehmer"]),
            "kleinunternehmerNote": company["kleinunternehmer_note"],
            "logoPath": company["logo_path"],
        },
        "customer": {
            "name": customer.get("name"),
            "contactPerson": customer.get("contactPerson") or customer.get("contact_person"),
            "street": customer.get("street"),
            "postalCode": customer.get("postalCode") or customer.get("postal_code"),
            "city": customer.get("city"),
            "country": customer.get("country"),
            "vatId": customer.get("vatId") or customer.get("vat_id"),
        },
        "outputPath": output_path,
        "profile": company["zugferd_profile"] or DEFAULT_PDF_PROFILE,
        "settings": {"pdf_theme": company["pdf_theme"] or DEFAULT_PDF_THEME},
    }


# ----------------------------------------------------------------------------
# Commands
# ----------------------------------------------------------------------------


def cmd_status(_args) -> None:
    path = resolve_db_path()
    with connect() as con:
        n_inv = con.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
        n_cust = con.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
    sandbox = (app_data_dir() / "sandbox.flag").exists()
    print(f"DB:         {path}")
    print(f"Sandbox:    {'JA' if sandbox else 'nein'}")
    print(f"Rechnungen: {n_inv}  ·  Kunden: {n_cust}")
    exe, _ = resolve_sidecar()
    print(f"Sidecar:    {exe or 'nicht verfügbar'}")


def cmd_customers(_args) -> None:
    with connect() as con:
        rows = con.execute("SELECT * FROM customers ORDER BY id").fetchall()
    if not rows:
        print("Keine Kunden.")
    for c in rows:
        print(f"{c['id']:>3}  {c['customer_number']:<8} {c['name']:<40} {c['city'] or '':<20} {c['email'] or ''}")


def resolve_customer(con, ref: str) -> sqlite3.Row:
    row = con.execute(
        "SELECT * FROM customers WHERE id = ? OR customer_number = ? OR name = ? COLLATE NOCASE",
        (int(ref) if ref.isdigit() else -1, ref, ref),
    ).fetchone()
    if not row:
        sys.exit(f"Kunde nicht gefunden: {ref} (siehe 'zettel.py customers')")
    return row


def cmd_invoice_list(args) -> None:
    q = "SELECT * FROM invoices"
    cond, params = [], []
    if args.status:
        cond.append("status = ?")
        params.append(args.status)
    if args.year:
        cond.append("CAST(strftime('%Y', issue_date, 'unixepoch', 'localtime') AS INT) = ?")
        params.append(args.year)
    if cond:
        q += " WHERE " + " AND ".join(cond)
    q += " ORDER BY id DESC"
    with connect() as con:
        rows = con.execute(q, params).fetchall()
    for r in rows:
        print(
            f"{r['id']:>3}  {display_number(r['number'], r['status']):<15} "
            f"{fmt_date(r['issue_date'])}  {fmt_money(r['total'], r['currency']):>12}  {r['status']:<9} "
            f"{'PDF' if r['pdf_path'] else '—':<3} fällig {fmt_date(r['due_date'])}"
        )


def fetch_invoice(con, invoice_id: int) -> sqlite3.Row:
    inv = con.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not inv:
        sys.exit(f"Rechnung {invoice_id} nicht gefunden.")
    return inv


def load_invoice_full(con, invoice_id: int) -> tuple[dict, list[dict], dict]:
    inv = fetch_invoice(con, invoice_id)
    items = [
        dict(r)
        for r in con.execute(
            "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position", (invoice_id,)
        ).fetchall()
    ]
    try:
        cust = json.loads(inv["customer_snapshot"])
    except (json.JSONDecodeError, TypeError):
        cust = {}
    return dict(inv), items, cust


def issue_invoice(con, invoice_id: int, sent_at: int | None = None) -> str:
    """Spiegel von issueInvoice(): Entwurf beanspruchen (Kundendaten einfrieren), dann echte Nummer ziehen."""
    inv = fetch_invoice(con, invoice_id)
    if inv["status"] != "draft":
        return inv["number"]
    customer = con.execute("SELECT * FROM customers WHERE id = ?", (inv["customer_id"],)).fetchone()
    if not customer:
        sys.exit(f"Kunde {inv['customer_id']} der Rechnung {invoice_id} nicht gefunden.")
    ts = sent_at or now_unix()
    claimed = con.execute(
        f"UPDATE invoices SET status = 'sent', sent_at = ?, customer_snapshot = ?, updated_at = {SQL_NOW} "
        "WHERE id = ? AND status = 'draft'",
        (ts, json.dumps(customer_snapshot(customer)), invoice_id),
    ).rowcount
    if claimed != 1:
        con.commit()
        return number_issued_concurrently(con, invoice_id)
    final_number = inv["number"]
    if is_draft_number(final_number):
        con.execute(
            "UPDATE settings SET invoice_number_counter = invoice_number_counter + 1, "
            f"updated_at = {SQL_NOW} WHERE id = 1"
        )
        row = con.execute(
            "SELECT invoice_number_counter, invoice_number_format FROM settings WHERE id = 1"
        ).fetchone()
        final_number = format_invoice_number(
            row["invoice_number_format"],
            row["invoice_number_counter"],
            datetime.fromtimestamp(inv["issue_date"] or ts),
        )
        con.execute("UPDATE invoices SET number = ? WHERE id = ?", (final_number, invoice_id))
    con.commit()
    return final_number


def number_issued_concurrently(con, invoice_id: int) -> str:
    """Spiegel von numberIssuedConcurrently(): ein anderer Prozess hat den Entwurf
    beansprucht, aber noch keine echte Nummer vergeben."""
    number = fetch_invoice(con, invoice_id)["number"]
    if is_draft_number(number):
        sys.exit("Die Rechnung wird gerade ausgestellt. Bitte gleich noch einmal versuchen.")
    return number


def safe_filename(s: str) -> str:
    return "".join(c if c not in '\\/:*?"<>|' else "_" for c in s)


PDF_VERSIONS_DIR = "Versionen"
PDF_VERSION_SEPARATOR = "__"


def _first_free_pdf_path(directory: Path, base: str) -> Path:
    dest = directory / f"{base}.pdf"
    n = 2
    while dest.exists():
        dest = directory / f"{base}-{n}.pdf"
        n += 1
    return dest


def _archive_into(source: Path, versions_dir: Path, archived_stem: str) -> Path:
    versions_dir.mkdir(parents=True, exist_ok=True)
    dest = _first_free_pdf_path(versions_dir, archived_stem)
    shutil.move(str(source), str(dest))
    return dest


def archive_pdf_version(path: Path, previous: Path | None = None) -> str | None:
    """Spiegel von fs_export.rs archive_pdf_version: bestehendes PDF vor dem
    Überschreiben nach <dir>/Versionen/<stem>__<mtime>.pdf verschieben. Liegt
    das bisher gespeicherte PDF (`previous`) in einem anderen Ordner, wandern
    es und seine Versionen mit, sonst fielen sie aus Versionsliste und Backup."""
    versions_dir = path.parent / PDF_VERSIONS_DIR
    archived = None
    if path.is_file():
        stem = f"{path.stem}{PDF_VERSION_SEPARATOR}{int(path.stat().st_mtime)}"
        archived = str(_archive_into(path, versions_dir, stem))
    if previous is not None:
        _adopt_pdf_versions(previous, path)
    return archived


def _same_dir(a: Path, b: Path) -> bool:
    try:
        return a.samefile(b)
    except OSError:
        return a == b


def _adopt_pdf_versions(previous: Path, target: Path) -> None:
    """Spiegel von fs_export.rs adopt_pdf_versions."""
    if _same_dir(previous.parent, target.parent):
        return
    versions_dir = target.parent / PDF_VERSIONS_DIR
    moves = []
    if previous.is_file():
        moves.append((previous, f"{PDF_VERSION_SEPARATOR}{int(previous.stat().st_mtime)}"))
    old_versions_dir = previous.parent / PDF_VERSIONS_DIR
    prefix = f"{previous.stem}{PDF_VERSION_SEPARATOR}"
    if previous.stem and old_versions_dir.is_dir():
        for archived in old_versions_dir.iterdir():
            if archived.is_file() and archived.name.startswith(prefix) and archived.suffix.lower() == ".pdf":
                moves.append((archived, archived.stem[len(previous.stem):]))
    for source, suffix in moves:
        _archive_into(source, versions_dir, f"{target.stem}{suffix}")


def _windows_documents_dir() -> Path | None:
    """Known Folder FOLDERID_Documents — folgt einer OneDrive-Umleitung."""
    import ctypes
    from ctypes import wintypes

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", wintypes.DWORD),
            ("Data2", wintypes.WORD),
            ("Data3", wintypes.WORD),
            ("Data4", ctypes.c_ubyte * 8),
        ]

    folder_id = GUID(
        0xFDD39AD0, 0x238F, 0x46AF, (ctypes.c_ubyte * 8)(0xAD, 0xB4, 0x6C, 0x85, 0x48, 0x03, 0x69, 0xC7)
    )
    path_ptr = ctypes.c_wchar_p()
    if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(folder_id), 0, None, ctypes.byref(path_ptr)) != 0:
        return None
    try:
        return Path(path_ptr.value)
    finally:
        ctypes.windll.ole32.CoTaskMemFree(path_ptr)


def _xdg_documents_dir() -> Path | None:
    """XDG_DOCUMENTS_DIR aus user-dirs.dirs, wie das dirs-Crate."""
    config_home = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    try:
        lines = (config_home / "user-dirs.dirs").read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        key, _, value = line.partition("=")
        if key.strip() == "XDG_DOCUMENTS_DIR":
            return Path(value.strip().strip('"').replace("$HOME", str(Path.home())))
    return None


def documents_dir() -> Path:
    """Spiegel von paths.rs documents_dir()."""
    if sys.platform == "win32":
        found = _windows_documents_dir()
    elif sys.platform == "darwin":
        found = None
    else:
        found = _xdg_documents_dir()
    return found or Path.home() / "Documents"


def documents_root() -> Path:
    """Spiegel von tenants.rs active_documents_root(): Sandbox und eigene
    Tenants bekommen eigene Ordner — Nummernkreise sind pro DB unabhängig,
    ein gemeinsamer Ordner würde fremde PDFs überschreiben."""
    if is_sandbox_active():
        return documents_dir() / "Zettel-Sandbox"
    tenant = active_custom_tenant()
    if tenant:
        return documents_dir() / "Zettel" / "Mandanten" / safe_filename(tenant["id"])
    return documents_dir() / "Zettel"


def pdf_output_dir() -> Path:
    return documents_root() / "Rechnungen"


def generate_pdf_for(con, invoice_id: int) -> tuple[str, str]:
    inv, items, cust = load_invoice_full(con, invoice_id)
    if inv["status"] == "draft" and is_draft_number(inv["number"]):
        issue_invoice(con, invoice_id)
        inv, items, cust = load_invoice_full(con, invoice_id)
    settings = dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone())
    out_dir = pdf_output_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    output_path = out_dir / f"{safe_filename(inv['number'])}.pdf"
    archive_pdf_version(output_path, Path(inv["pdf_path"]) if inv["pdf_path"] else None)
    payload = build_pdf_payload(inv, items, cust, settings, str(output_path))
    resp = call_sidecar("generate_invoice", payload)
    if not resp.get("success"):
        err = resp.get("error", {})
        sys.exit(f"PDF-Fehler [{err.get('code')}]: {err.get('message')}\n{err.get('details', '')[:ERROR_DETAIL_CHARS]}")
    # Der CLI validiert nicht (Java/KoSIT läuft über die App); ein alter Status gehörte zum vorherigen PDF.
    con.execute(
        "UPDATE invoices SET pdf_path = ?, last_validation_status = NULL, last_validated_at = NULL, "
        f"last_validation_findings_count = NULL, updated_at = {SQL_NOW} WHERE id = ?",
        (resp["pdfPath"], invoice_id),
    )
    con.commit()
    return inv["number"], resp["pdfPath"]


def parse_items_arg(spec: str | None) -> list[dict]:
    """Format: 'Beschreibung|Menge|Einheit|Einzelpreis-Euro[|MwSt%][|Langtext]'.
    Mehrere Positionen mit ; trennen."""
    if not spec:
        return []
    items = []
    for part in spec.split(";"):
        part = part.strip()
        if not part:
            continue
        fields = [f.strip() for f in part.split("|")]
        if len(fields) < MIN_ITEM_FIELDS:
            sys.exit(f"Position ungültig (min. {MIN_ITEM_FIELDS} Felder): {part}")
        optional = fields[MIN_ITEM_FIELDS:] + [""] * 2
        vat_field, long_desc = optional[0], optional[1]
        try:
            qty = parse_decimal(fields[1])
            price_eur = parse_decimal(fields[3])
            vat = parse_decimal(vat_field) if vat_field else 0
        except ValueError:
            sys.exit(f"Position ungültig (Zahl erwartet für Menge/Preis/MwSt): {part}")
        items.append(
            {
                "description": fields[0],
                "quantity": qty,
                "unit": fields[2] or DEFAULT_UNIT,
                "unitPrice": js_round(price_eur * CENTS_PER_EUR),
                "vatRate": int(vat),
                "longDescription": long_desc or None,
            }
        )
    return items


def parse_decimal(s: str) -> float:
    return float(s.replace(",", "."))


def customer_snapshot(customer: sqlite3.Row) -> dict:
    return {
        "customerNumber": customer["customer_number"],
        "name": customer["name"],
        "contactPerson": customer["contact_person"],
        "street": customer["street"],
        "postalCode": customer["postal_code"],
        "city": customer["city"],
        "country": customer["country"],
        "email": customer["email"],
        "vatId": customer["vat_id"],
    }


def insert_draft_invoice(con, args, customer: sqlite3.Row, settings: dict, totals: dict, is_reverse_charge: bool) -> int:
    issue_ts = parse_date(args.issue_date) or now_unix()
    terms_days = (
        args.payment_terms
        if args.payment_terms is not None
        else (settings["default_payment_terms_days"] or DEFAULT_PAYMENT_TERMS_DAYS)
    )
    due_ts = parse_date(args.due_date) or add_days_unix(issue_ts, terms_days)
    payment_terms = payment_terms_text(terms_days)
    skonto_percent, skonto_days = resolve_skonto(args, settings)
    pdf_language = args.pdf_language or settings.get("default_pdf_language") or DEFAULT_PDF_LANGUAGE
    eur_total_cent = compute_eur_total_cent(args.currency, totals["total"], args.exchange_rate)
    cur = con.execute(
        """INSERT INTO invoices
           (number, customer_id, customer_snapshot, issue_date, delivery_date, due_date,
            status, subtotal, vat_amount, total, is_kleinunternehmer, is_reverse_charge,
            reverse_charge_type, supply_kind, notes, payment_terms, is_credit_note, corrects_invoice_id,
            currency, exchange_rate, eur_total_cent, notes_internal, follow_up_date,
            service_period_start, service_period_end, skonto_percent, skonto_days, pdf_language)
           VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL,
                   ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)""",
        (
            draft_placeholder(),
            customer["id"],
            json.dumps(customer_snapshot(customer), ensure_ascii=False),
            issue_ts,
            parse_date(args.delivery_date),
            due_ts,
            totals["subtotal"],
            totals["vatAmount"],
            totals["total"],
            1 if settings["is_kleinunternehmer"] else 0,
            1 if is_reverse_charge else 0,
            args.reverse_charge,
            args.supply_kind,
            args.notes,
            payment_terms,
            args.currency,
            args.exchange_rate,
            eur_total_cent,
            parse_date(args.service_start),
            parse_date(args.service_end),
            skonto_percent,
            skonto_days,
            pdf_language,
        ),
    )
    return cur.lastrowid


def insert_invoice_items(con, invoice_id: int, items: list[dict]) -> None:
    for position, it in enumerate(items, start=1):
        con.execute(
            """INSERT INTO invoice_items
               (invoice_id, position, description, quantity, unit, unit_price, vat_rate, line_total,
                long_description, line_period_start, line_period_end)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)""",
            (
                invoice_id,
                position,
                it["description"],
                it["quantity"],
                it["unit"],
                it["unitPrice"],
                it["vatRate"],
                compute_line_total(it["quantity"], it["unitPrice"]),
                it.get("longDescription"),
            ),
        )


def cmd_invoice_create(args) -> None:
    items = parse_items_arg(args.items)
    if not items:
        sys.exit("Keine Positionen angegeben (siehe --items).")
    if args.currency != BASE_CURRENCY and parse_exchange_rate_scaled(args.exchange_rate) is None:
        sys.exit(f"Wechselkurs erforderlich für {args.currency}: --exchange-rate (1 EUR = X {args.currency}).")
    with connect() as con:
        settings = dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone())
        customer = resolve_customer(con, args.customer)
        is_reverse_charge = args.reverse_charge != "none"
        totals = compute_totals(items, bool(settings["is_kleinunternehmer"]), is_reverse_charge)
        invoice_id = insert_draft_invoice(con, args, customer, settings, totals, is_reverse_charge)
        insert_invoice_items(con, invoice_id, items)
        con.commit()
        print(f"Draft erstellt: id={invoice_id}  {fmt_money(totals['total'], args.currency)}  Kunde: {customer['name']}")
        if args.issue:
            print(f"Bereitgestellt: {issue_invoice(con, invoice_id)}")
        if args.pdf:
            _, pdf_path = generate_pdf_for(con, invoice_id)
            print(f"PDF: {pdf_path}")


def cmd_invoice_show(args) -> None:
    with connect() as con:
        inv, items, cust = load_invoice_full(con, args.id)
    print(f"Rechnung {display_number(inv['number'], inv['status'])}  [{inv['status']}]")
    print(f"Kunde:        {cust.get('name')} ({cust.get('customerNumber')})")
    print(f"Datum:        {fmt_date(inv['issue_date'])}  ·  fällig {fmt_date(inv['due_date'])}")
    if inv["service_period_start"]:
        print(f"Leistung:     {fmt_date(inv['service_period_start'])} – {fmt_date(inv['service_period_end'])}")
    print(f"Zahlungsziel: {inv['payment_terms'] or '—'}")
    print()
    for it in items:
        print(f"  {it['position']}. {it['description']}")
        print(f"     {it['quantity']:g} {it['unit']} × {fmt_money(it['unit_price'], inv['currency'])} = {fmt_money(it['line_total'], inv['currency'])}")
    print()
    currency = inv["currency"]
    print(
        f"Netto: {fmt_money(inv['subtotal'], currency)}  ·  USt: {fmt_money(inv['vat_amount'], currency)}  "
        f"·  Gesamt: {fmt_money(inv['total'], currency)}"
    )
    if inv["pdf_path"]:
        print(f"PDF:   {inv['pdf_path']}")


def cmd_invoice_pdf(args) -> None:
    with connect() as con:
        number, path = generate_pdf_for(con, args.id)
    print(f"{number}: {path}")


def cmd_invoice_issue(args) -> None:
    with connect() as con:
        print(f"Bereitgestellt: {issue_invoice(con, args.id, parse_date(args.sent_at))}")


# Spiegel von settledByCreditNoteSql() in src/lib/db/invoice-lifecycle.ts: nur eine
# ausgestellte Stornorechnung gleicht die Rechnung aus, ein Storno-Entwurf nicht.
SETTLED_BY_CREDIT_NOTE_SQL = """EXISTS (
  SELECT 1 FROM invoices credit_note
   WHERE credit_note.corrects_invoice_id = invoices.id
     AND credit_note.is_credit_note = 1
     AND credit_note.status NOT IN ('draft','cancelled'))"""


def is_settled_by_credit_note(con, invoice_id: int) -> bool:
    row = con.execute(f"SELECT {SETTLED_BY_CREDIT_NOTE_SQL} FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    return bool(row and row[0])


def mark_invoice_paid(con, invoice_id: int, paid_at: int) -> sqlite3.Row | None:
    """Spiegel von markPaid(): zahlt den Restbetrag nur bei sent/partial, sonst None."""
    if fetch_invoice(con, invoice_id)["status"] == "draft":
        issue_invoice(con, invoice_id, paid_at)
    inv = fetch_invoice(con, invoice_id)
    if inv["status"] not in PAYABLE_STATUSES:
        return None
    if is_settled_by_credit_note(con, invoice_id):
        sys.exit(
            f"Rechnung {inv['number']} ist durch eine Stornorechnung ausgeglichen. "
            "Zahlungen können nicht mehr erfasst werden."
        )
    total = abs(inv["total"])
    paid_before = con.execute(
        "SELECT COALESCE(SUM(amount_cent), 0) FROM invoice_payments WHERE invoice_id = ?", (invoice_id,)
    ).fetchone()[0]
    remaining = total - paid_before
    if remaining > 0:
        con.execute(
            "INSERT INTO invoice_payments (invoice_id, paid_at, amount_cent, source) VALUES (?, ?, ?, 'auto')",
            (invoice_id, paid_at, remaining),
        )
    con.execute(
        f"UPDATE invoices SET status = 'paid', paid_at = ?, amount_paid_cent = ?, updated_at = {SQL_NOW} "
        "WHERE id = ? AND status IN ('sent','partial')",
        (paid_at, max(total, paid_before), invoice_id),
    )
    con.commit()
    return inv


def cmd_invoice_paid(args) -> None:
    with connect() as con:
        inv = mark_invoice_paid(con, args.id, parse_date(args.paid_at) or now_unix())
        if inv is None:
            status = fetch_invoice(con, args.id)["status"]
            sys.exit(f"Rechnung {args.id} hat Status '{status}' und kann nicht als bezahlt markiert werden.")
    print(f"Als bezahlt markiert: {inv['number']} ({fmt_money(abs(inv['total']), inv['currency'])})")


# Spiegel von REVENUE_AMOUNT_SQL / OPEN_BALANCE_SQL in src/lib/dashboard/queries.ts:
# Fremdwährung zählt über den eingefrorenen EUR-Gegenwert, der gezahlte Anteil wird
# proportional umgerechnet (ganzzahlig, half-up).
REVENUE_AMOUNT_SQL = "COALESCE(eur_total_cent, total)"
OPEN_BALANCE_SQL = """(CASE
  WHEN eur_total_cent IS NULL OR total = 0 THEN total - COALESCE(amount_paid_cent, 0)
  ELSE eur_total_cent - (2 * eur_total_cent * COALESCE(amount_paid_cent, 0) + total) / (2 * total)
END)"""


def compute_stats(con, year: int) -> tuple[int, int, int]:
    """(Umsatz des Jahres, Anzahl offener Rechnungen, offener Saldo) in EUR-Cent."""
    revenue = con.execute(
        f"SELECT COALESCE(SUM({REVENUE_AMOUNT_SQL}),0) FROM invoices "
        "WHERE status NOT IN ('cancelled','draft') "
        "AND strftime('%Y', issue_date, 'unixepoch', 'localtime') = ?",
        (str(year),),
    ).fetchone()[0]
    open_count, open_total = con.execute(
        f"SELECT COUNT(*), COALESCE(SUM({OPEN_BALANCE_SQL}),0) FROM invoices WHERE status IN ('sent','partial')"
    ).fetchone()
    return revenue, open_count, open_total


def cmd_stats(_args) -> None:
    year = datetime.now().year
    with connect() as con:
        revenue, open_count, open_total = compute_stats(con, year)
    print(f"Umsatz {year} (ohne Entwurf/Storno): {fmt_eur(revenue)}")
    print(f"Offene Forderungen: {open_count} · {fmt_eur(open_total)}")


def main() -> None:
    ap = argparse.ArgumentParser(prog="zettel", description="Zettel CLI")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status", help="DB/Sidecar-Status").set_defaults(func=cmd_status)
    sub.add_parser("customers", help="Kunden listen").set_defaults(func=cmd_customers)

    p_ls = sub.add_parser("invoices", help="Rechnungen listen")
    p_ls.add_argument("--status", choices=["draft", "sent", "partial", "paid", "cancelled"])
    p_ls.add_argument("--year", type=int)
    p_ls.set_defaults(func=cmd_invoice_list)

    p_new = sub.add_parser("invoice:create", help="Rechnung (Draft) anlegen")
    p_new.add_argument("--customer", required=True, help="ID, Kundennummer oder Name")
    p_new.add_argument(
        "--items", required=True,
        help="'Desc|Menge|Einheit|Preis€[|MwSt][|Langtext]' — mehrere mit ;",
    )
    p_new.add_argument("--issue-date")
    p_new.add_argument("--due-date")
    p_new.add_argument("--delivery-date")
    p_new.add_argument("--service-start")
    p_new.add_argument("--service-end")
    p_new.add_argument("--payment-terms", type=int, help="Tage (Default aus Settings)")
    p_new.add_argument("--reverse-charge", default="none", choices=["none", "intra_eu", "third_country"])
    p_new.add_argument("--supply-kind", default="services", choices=["goods", "services"], help="Lieferung oder sonstige Leistung (nur bei Reverse-Charge relevant)")
    p_new.add_argument("--skonto-percent", type=float, help="Default aus den Settings, falls dort aktiv")
    p_new.add_argument("--skonto-days", type=int, help="Default aus den Settings, falls dort aktiv")
    p_new.add_argument("--no-skonto", action="store_true", help="Kein Skonto, auch wenn die Settings es vorbelegen")
    p_new.add_argument("--pdf-language", choices=["de", "en"], help="Default aus den Settings")
    p_new.add_argument("--currency", default=BASE_CURRENCY, choices=SUPPORTED_CURRENCIES)
    p_new.add_argument("--exchange-rate", help="1 EUR = X Fremdwährung (Pflicht außer bei EUR)")
    p_new.add_argument("--notes")
    p_new.add_argument("--issue", action="store_true", help="Direkt bereitstellen (Nummer ziehen)")
    p_new.add_argument("--pdf", action="store_true", help="PDF generieren (impliziert --issue)")
    p_new.set_defaults(func=cmd_invoice_create)

    p_show = sub.add_parser("invoice:show", help="Rechnung anzeigen")
    p_show.add_argument("id", type=int)
    p_show.set_defaults(func=cmd_invoice_show)

    p_pdf = sub.add_parser("invoice:pdf", help="PDF generieren")
    p_pdf.add_argument("id", type=int)
    p_pdf.set_defaults(func=cmd_invoice_pdf)

    p_iss = sub.add_parser("invoice:issue", help="Draft bereitstellen (Nummer ziehen)")
    p_iss.add_argument("id", type=int)
    p_iss.add_argument("--sent-at")
    p_iss.set_defaults(func=cmd_invoice_issue)

    p_paid = sub.add_parser("invoice:paid", help="Als bezahlt markieren")
    p_paid.add_argument("id", type=int)
    p_paid.add_argument("--paid-at")
    p_paid.set_defaults(func=cmd_invoice_paid)

    p_stats = sub.add_parser("stats", help="Kennzahlen")
    p_stats.set_defaults(func=cmd_stats)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
