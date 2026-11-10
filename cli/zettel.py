#!/usr/bin/env python3
"""
Zettel CLI — headless Steuerung der Zettel-Datenbank.

Repliziert die App-Geschäftslogik aus src/lib/db/invoices.ts exakt:
  - Draft-Placeholder `DRAFT-<hex>` (kein Nummern-Slot wird verbrannt)
  - Lazy Invoice-Numbering: echte Nummer erst bei issue/markSent/PDF
  - computeTotals: Per-Line-Rundung (Finanzamt-Konvention), Cent-Integer
  - markPaid protokolliert Restbetrag als invoice_payments-Eintrag
  - issue hängt ein Siegel an die Hash-Kette über ausgestellte Rechnungen (invoice_seals)
  - PDF-Generierung über den Sidecar (JSON-RPC über stdin/stdout)

DB-Auswahl folgt derselben Quelle der Wahrheit wie die App:
  sandbox.flag vorhanden  -> zettel-sandbox.db
  sonst aktiver Tenant    -> dessen Pfad aus tenants.json
  sonst                   -> zettel.db (Standard)
Linux: the built-in DBs live in ~/.config/digital.laux.zettel/, sandbox.flag and
tenants.json in ~/.local/share/digital.laux.zettel/ (Windows/macOS: one folder).

Nur stdlib — bewusst ohne externe Abhängigkeiten.

Warnung: Nicht parallel zur laufenden Zettel-App mit schreibendem Zugriff
verwenden (SQLite single-writer). Lesende Befehle sind unproblematisch.
"""
from __future__ import annotations

import argparse
import hashlib
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
from decimal import Decimal
from pathlib import Path
from typing import Iterator

APP_IDENTIFIER = "digital.laux.zettel"
# Must equal CURRENT_DB_SCHEMA_VERSION in src/lib/utils/schema-version.ts (a test pins that).
EXPECTED_SCHEMA = 32
DEFAULT_PAYMENT_TERMS_DAYS = 14
DEFAULT_OFFER_VALIDITY_DAYS = 30
SECONDS_PER_DAY = 86400
DEFAULT_UNIT = "Std"
DEFAULT_PDF_PROFILE = "en16931"
DEFAULT_PDF_THEME = "classic"
DEFAULT_PDF_LANGUAGE = "de"
PAYABLE_STATUSES = ("sent", "partial")
REMINDER_LABELS = {1: "Zahlungserinnerung", 2: "Mahnung", 3: "Letzte Mahnung"}
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
# Spiegel von src/lib/xrechnung/preflight.ts (BR-DE-27/28)
XRECHNUNG_MIN_PHONE_DIGITS = 3
XRECHNUNG_EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+$")

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


def app_config_dir() -> Path:
    """Where tauri-plugin-sql puts relative DB paths (app_config_dir). Differs from app_data_dir on Linux only."""
    if sys.platform in ("win32", "darwin"):
        return app_data_dir()
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / APP_IDENTIFIER


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
    """Active DB: sandbox > active tenant > default. Like resolve_active_url().
    The flag file and tenants.json live in the data dir, the built-in DBs in the config dir."""
    if is_sandbox_active():
        return app_config_dir() / "zettel-sandbox.db"
    tenant = active_custom_tenant()
    if tenant:
        return Path(tenant["path"])
    return app_config_dir() / "zettel.db"


@contextmanager
def connect(check_schema: bool = True) -> Iterator[sqlite3.Connection]:
    path = resolve_db_path()
    if not path.exists():
        sys.exit(f"Fehler: Datenbank nicht gefunden: {path}")
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        version = con.execute("PRAGMA user_version").fetchone()[0]
        if check_schema and version != EXPECTED_SCHEMA:
            sys.exit(
                f"Schema-Version {version} der Datenbank passt nicht zu dieser CLI (erwartet {EXPECTED_SCHEMA}). "
                "App und CLI auf dieselbe Version bringen; es wurde nichts geschrieben."
            )
        yield con
    finally:
        con.close()


# ----------------------------------------------------------------------------
# Ausgabe (--json) und Idempotenz-Schlüssel
# ----------------------------------------------------------------------------

JSON_MODE = False


def emit(data: dict, text: str = "") -> None:
    """Text für Menschen; mit --json genau ein Objekt {"ok": true, ...} auf stdout."""
    if JSON_MODE:
        print(json.dumps({"ok": True, **data}, ensure_ascii=False))
    elif text:
        print(text)


def iso(unix) -> str | None:
    return datetime.fromtimestamp(unix).strftime("%Y-%m-%d") if unix else None


def idempotency_file() -> Path:
    return app_data_dir() / "cli-idempotency.json"


def _idempotency_load() -> dict:
    try:
        return json.loads(idempotency_file().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _idempotency_id(kind: str, key: str) -> str:
    return f"{resolve_db_path()}|{kind}|{key}"


def idempotency_lookup(con, kind: str, table: str, key: str | None) -> int | None:
    """Id des mit diesem Schlüssel angelegten Datensatzes. created_at muss zum gespeicherten Wert passen,
    sonst stammt der Schlüssel aus einer anderen DB-Generation (Restore, Wipe) und wird ignoriert."""
    if not key:
        return None
    entry = _idempotency_load().get(_idempotency_id(kind, key))
    if not isinstance(entry, dict):
        return None
    row = con.execute(f"SELECT created_at FROM {table} WHERE id = ?", (entry.get("id"),)).fetchone()
    return entry["id"] if row and row[0] == entry.get("createdAt") else None


def idempotency_store(con, kind: str, table: str, key: str | None, row_id: int) -> None:
    # ponytail: Schlüssel liegen neben der DB, nicht darin (keine Migration). Stirbt der Prozess zwischen COMMIT
    # und diesem Schreiben, entsteht beim Retry ein Duplikat. Echte Garantie = Spalte + Migration.
    if not key:
        return
    created_at = con.execute(f"SELECT created_at FROM {table} WHERE id = ?", (row_id,)).fetchone()[0]
    data = _idempotency_load()
    data[_idempotency_id(kind, key)] = {"id": row_id, "createdAt": created_at}
    target = idempotency_file()
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
    tmp.replace(target)


def create_once(con, kind: str, table: str, key: str | None, create) -> tuple[int, bool]:
    """(id, reused): mit Schlüssel legt eine Wiederholung nichts neu an."""
    existing = idempotency_lookup(con, kind, table, key)
    if existing:
        return existing, True
    row_id = create()
    idempotency_store(con, kind, table, key, row_id)
    return row_id, False


def reuse_note(reused: bool, key: str | None) -> str:
    return f" (idempotency-key '{key}': bereits vorhanden, nichts neu angelegt)" if reused else ""


# ----------------------------------------------------------------------------
# Geschäftslogik (Spiegel von src/lib/utils/totals.ts + invoices.ts)
# ----------------------------------------------------------------------------


def js_round(v: float) -> int:
    """Math.round wie in JS: .5 rundet Richtung +unendlich (Pythons round() ist banker's)."""
    return math.floor(v + 0.5)


QUANTITY_SCALE = 10_000  # Mengen haben höchstens vier Nachkommastellen (wie im ZUGFeRD-XML)


def round_quantity(quantity: float) -> float:
    """Spiegel von roundQuantity in src/lib/utils/totals.ts: die gespeicherte Menge ist die, mit der gerechnet wird."""
    return js_round(quantity * QUANTITY_SCALE) / QUANTITY_SCALE


def compute_line_total(quantity: float, unit_price_cent: int) -> int:
    """Menge x Einzelpreis exakt in Cent, .5 Richtung +unendlich; die Float-Rechnung rundet 0,47 x 8550 falsch ab."""
    return (js_round(quantity * QUANTITY_SCALE) * unit_price_cent + QUANTITY_SCALE // 2) // QUANTITY_SCALE


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


def from_eur_cents(eur_cents: int, rate_scaled: int) -> int:
    """Spiegel von fromEurCents(): EUR-Betrag in die Fremdwährung ("1 EUR = X Fremdwährung"), half-up."""
    quotient, remainder = divmod(abs(eur_cents) * rate_scaled, RATE_SCALE)
    rounded = quotient + 1 if remainder * 2 >= RATE_SCALE else quotient
    return -rounded if eur_cents < 0 else rounded


def eur_cents_to_currency(eur_cents: int, currency: str, exchange_rate: str | None) -> int | None:
    """Spiegel von eurCentsToCurrency(): None bei Fremdwährung ohne brauchbaren Kurs."""
    if currency == BASE_CURRENCY:
        return eur_cents
    rate_scaled = parse_exchange_rate_scaled(exchange_rate)
    return None if rate_scaled is None else from_eur_cents(eur_cents, rate_scaled)


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


def draw_next_number(con, sequence: str, document_date: int) -> str:
    """Spiegel von drawNextNumber() (Angebot/Mahnung): Zähler hochzählen, Jahr und Monat aus dem Belegdatum.
    Hochzählen und Lesen laufen in einer Transaktion, der Schreibzugriff sperrt die DB bis zum COMMIT."""
    counter, fmt = f"{sequence}_number_counter", f"{sequence}_number_format"
    con.execute(f"UPDATE settings SET {counter} = {counter} + 1, updated_at = {SQL_NOW} WHERE id = 1")
    row = con.execute(f"SELECT {counter} AS counter, {fmt} AS format FROM settings WHERE id = 1").fetchone()
    return format_invoice_number(row["format"], row["counter"], datetime.fromtimestamp(document_date))


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
    if isinstance(s, int):
        return s
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
    if getattr(sys, "frozen", False):
        # installierte App: <install>/cli/zettel-cli(.exe) neben <install>/sidecar/
        name = "zettel-sidecar.exe" if sys.platform == "win32" else "zettel-sidecar"
        sibling = Path(sys.executable).resolve().parent.parent / "sidecar" / name
        if sibling.is_file():
            return str(sibling), None
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
        "discountCent": (inv["total"] * js_round(percent * 100) + 5000) // 10000,
        "deadlineUnix": add_days_unix(inv["issue_date"] or now_unix(), days),
    }


def trimmed(value):
    """Spiegel von .trim() in payload.ts: was die Vorprüfung akzeptiert hat, landet unverändert im XML."""
    return value.strip() if isinstance(value, str) else value


def items_payload(items: list[dict]) -> list[dict]:
    """Spiegel von itemsPayload() in src/lib/sidecar/payload.ts."""
    return [
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
    ]


def company_contact_payload(company: dict) -> dict:
    """Spiegel von companyContactPayload()."""
    return {
        "companyName": company["company_name"],
        "ownerName": trimmed(company["owner_name"]),
        "street": company["street"],
        "postalCode": company["postal_code"],
        "city": company["city"],
        "country": company["country"],
        "taxNumber": company["tax_number"],
        "vatId": company["vat_id"],
        "email": trimmed(company["email"]),
        "phone": trimmed(company["phone"]),
        "website": company["website"],
        "logoPath": company["logo_path"],
    }


def customer_payload(customer: dict) -> dict:
    """Spiegel von customerPayload(); akzeptiert Snapshot (camelCase) und DB-Zeile (snake_case)."""
    return {
        "name": customer.get("name"),
        "contactPerson": customer.get("contactPerson") or customer.get("contact_person"),
        "street": customer.get("street"),
        "postalCode": customer.get("postalCode") or customer.get("postal_code"),
        "city": customer.get("city"),
        "country": customer.get("country"),
        "email": trimmed(customer.get("email")),
        "vatId": customer.get("vatId") or customer.get("vat_id"),
    }


def skonto_payload(skonto: dict | None) -> dict:
    return {
        "skontoPercent": skonto["percent"] if skonto else None,
        "skontoDays": skonto["days"] if skonto else None,
        "skontoAmountCent": skonto["discountCent"] if skonto else None,
        "skontoDeadline": skonto["deadlineUnix"] if skonto else None,
    }


def missing_company_data(company: dict) -> list[str]:
    """Spiegel von missingCompanyData() in src/lib/utils/company-completeness.ts (§ 14 UStG)."""
    missing = []
    if _blank(company["company_name"]):
        missing.append("Firmenname")
    if not _has_address(company["street"], company["postal_code"], company["city"]):
        missing.append("Anschrift")
    if _blank(company["tax_number"]) and _blank(company["vat_id"]):
        missing.append("Steuernummer oder USt-IdNr.")
    return missing


def require_complete_company(company: dict) -> None:
    missing = missing_company_data(company)
    if missing:
        sys.exit(
            f"Firmendaten unvollständig: {', '.join(missing)}. "
            "Bitte in der App unter Einstellungen → Unternehmen ergänzen."
        )


def build_offer_payload(offer: dict, items: list[dict], customer: dict, company: dict, output_path: str) -> dict:
    """Spiegel von buildOfferPayload() in src/lib/sidecar/offer.ts."""
    skonto = skonto_of({**offer, "is_credit_note": 0})
    return {
        "offer": {
            "number": offer["number"],
            "issueDate": offer["issue_date"],
            "validUntil": offer["valid_until"],
            "subtotal": offer["subtotal"],
            "vatAmount": offer["vat_amount"],
            "total": offer["total"],
            "currency": offer["currency"] or BASE_CURRENCY,
            "exchangeRate": offer["exchange_rate"],
            "isKleinunternehmer": bool(offer["is_kleinunternehmer"]),
            "isReverseCharge": bool(offer["is_reverse_charge"]),
            "reverseChargeType": stored_reverse_charge_type(offer["reverse_charge_type"], bool(offer["is_reverse_charge"])),
            "supplyKind": offer["supply_kind"],
            "notes": offer["notes"],
            "introText": offer["intro_text"],
            "servicePeriodStart": offer["service_period_start"],
            "servicePeriodEnd": offer["service_period_end"],
            **skonto_payload(skonto),
            "pdfLanguage": offer["pdf_language"] or DEFAULT_PDF_LANGUAGE,
        },
        "items": items_payload(items),
        "company": {
            **company_contact_payload(company),
            "isKleinunternehmer": bool(company["is_kleinunternehmer"]),
            "kleinunternehmerNote": company["kleinunternehmer_note"],
        },
        "customer": customer_payload(customer),
        "outputPath": output_path,
        "settings": {"pdf_theme": company["pdf_theme"] or DEFAULT_PDF_THEME},
    }


def build_reminder_payload(reminder: dict, invoice: dict, snapshot: dict, company: dict, output_path: str) -> dict:
    """Spiegel von buildReminderPayload() in src/lib/sidecar/reminder.ts."""
    return {
        "reminder": {
            "number": reminder["number"],
            "level": reminder["level"],
            "levelLabel": REMINDER_LABELS[reminder["level"]],
            "issueDate": reminder["issue_date"],
            "dueDate": reminder["due_date"],
            "feeCents": reminder["fee_cents"],
            "interestCents": reminder["interest_cents"],
            "originalTotalCents": reminder["original_total_cents"],
            "totalDueCents": reminder["total_due_cents"],
            "bodyText": reminder["body_text"],
        },
        "invoice": {
            "invoiceNumber": snapshot.get("invoiceNumber"),
            "invoiceIssueDate": snapshot.get("invoiceIssueDate"),
            "invoiceDueDate": snapshot.get("invoiceDueDate"),
            "currency": invoice["currency"] or BASE_CURRENCY,
        },
        "customer": {
            "name": snapshot.get("customerName"),
            "contactPerson": snapshot.get("customerContactPerson"),
            "street": snapshot.get("customerStreet"),
            "postalCode": snapshot.get("customerPostalCode"),
            "city": snapshot.get("customerCity"),
            "country": snapshot.get("customerCountry"),
        },
        "company": {
            **company_contact_payload(company),
            "bankName": company["bank_name"],
            "bankIban": company["bank_iban"],
            "bankBic": company["bank_bic"],
        },
        "outputPath": output_path,
        "settings": {"pdf_theme": company["pdf_theme"] or DEFAULT_PDF_THEME},
    }


def stored_reverse_charge_type(stored: str | None, is_reverse_charge: bool) -> str:
    """Spiegel von storedReverseChargeType(): alte Zeilen mit nur dem Boolean gelten als innergemeinschaftlich."""
    kind = stored if stored in ("intra_eu", "third_country") else "none"
    return "intra_eu" if kind == "none" and is_reverse_charge else kind


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
            "buyerReference": inv["buyer_reference"],
        },
        "items": items_payload(items),
        "company": {
            **company_contact_payload(company),
            "bankName": company["bank_name"],
            "bankIban": company["bank_iban"],
            "bankBic": company["bank_bic"],
            "isKleinunternehmer": bool(company["is_kleinunternehmer"]),
            "kleinunternehmerNote": company["kleinunternehmer_note"],
        },
        "customer": customer_payload(customer),
        "outputPath": output_path,
        "profile": company["zugferd_profile"] or DEFAULT_PDF_PROFILE,
        "settings": {"pdf_theme": company["pdf_theme"] or DEFAULT_PDF_THEME},
    }


def _blank(value) -> bool:
    return value is None or not str(value).strip()


def _has_address(street, postal_code, city) -> bool:
    return not (_blank(street) or _blank(postal_code) or _blank(city))


def _has_phone_number(phone) -> bool:
    return len(re.sub(r"[^0-9]", "", phone or "")) >= XRECHNUNG_MIN_PHONE_DIGITS


def _is_email(value) -> bool:
    return bool(XRECHNUNG_EMAIL_PATTERN.fullmatch((value or "").strip()))


def with_live_customer_fallbacks(buyer_reference, snapshot: dict, live) -> tuple[str | None, dict]:
    """Spiegel von withLiveCustomerFallbacks() in src/lib/xrechnung/export-data.ts: eine ausgestellte
    Rechnung bleibt unverändert, fehlende Leitweg-ID und Kunden-E-Mail kommen vom aktuellen Kunden."""
    live_leitweg = live["leitweg_id"] if live else None
    live_email = live["email"] if live else None
    own = (buyer_reference or "").strip() or (live_leitweg or "").strip() or None
    customer = dict(snapshot)
    if _blank(customer.get("email")):
        customer["email"] = live_email or customer.get("email")
    return own, customer


def missing_xrechnung_fields(buyer_reference: str | None, company: dict, customer: dict) -> list[str]:
    """Spiegel von missingXrechnungFields() in src/lib/xrechnung/preflight.ts: deutsche Labels
    der Pflichtangaben (BR-DE-1 bis BR-DE-16, elektronische Adressen); leer = exportierbar."""
    missing = []
    if _blank(buyer_reference):
        missing.append("Leitweg-ID / Käuferreferenz")
    if _blank(company["company_name"]):
        missing.append("Firmenname des Verkäufers")
    if not _has_address(company["street"], company["postal_code"], company["city"]):
        missing.append("Anschrift des Verkäufers")
    if _blank(company["owner_name"]):
        missing.append("Ansprechpartner des Verkäufers (Inhaber:in)")
    if not _has_phone_number(company["phone"]):
        missing.append("Telefonnummer des Verkäufers")
    if not _is_email(company["email"]):
        missing.append("E-Mail-Adresse des Verkäufers")
    if _blank(company["vat_id"]) and _blank(company["tax_number"]):
        missing.append("USt-IdNr. oder Steuernummer des Verkäufers")
    if _blank(company["bank_iban"]):
        missing.append("Zahlungsweg (IBAN des Verkäufers)")
    if not _has_address(customer.get("street"), customer.get("postalCode"), customer.get("city")):
        missing.append("Anschrift des Kunden")
    if not _is_email(customer.get("email")):
        missing.append("E-Mail-Adresse des Kunden")
    return missing


# ----------------------------------------------------------------------------
# Commands
# ----------------------------------------------------------------------------


def snapshot_of(raw) -> dict:
    try:
        return json.loads(raw) or {}
    except (json.JSONDecodeError, TypeError):
        return {}


def inv_dict(r) -> dict:
    return {
        "id": r["id"],
        "number": None if is_draft_number(r["number"]) else r["number"],
        "displayNumber": display_number(r["number"], r["status"]),
        "status": r["status"],
        "customer": snapshot_of(r["customer_snapshot"]).get("name"),
        "issueDate": iso(r["issue_date"]),
        "dueDate": iso(r["due_date"]),
        "totalCent": r["total"],
        "currency": r["currency"] or BASE_CURRENCY,
        "pdfPath": r["pdf_path"],
    }


def items_dict(rows) -> list[dict]:
    return [
        {"position": r["position"], "description": r["description"], "quantity": r["quantity"], "unit": r["unit"],
         "unitPriceCent": r["unit_price"], "vatRate": r["vat_rate"], "lineTotalCent": r["line_total"]}
        for r in rows
    ]


def print_items(items, currency) -> list[str]:
    lines = []
    for it in items:
        lines.append(f"  {it['position']}. {it['description']}")
        lines.append(
            f"     {it['quantity']:g} {it['unit']} × {fmt_money(it['unit_price'], currency)} "
            f"= {fmt_money(it['line_total'], currency)}"
        )
    return lines


def cmd_status(_args) -> None:
    path = resolve_db_path()
    with connect(check_schema=False) as con:
        n_inv = con.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
        n_cust = con.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
        schema = con.execute("PRAGMA user_version").fetchone()[0]
    sandbox = is_sandbox_active()
    exe, _ = resolve_sidecar()
    compatible = schema == EXPECTED_SCHEMA
    emit(
        {"db": str(path), "sandbox": sandbox, "invoices": n_inv, "customers": n_cust, "sidecar": exe,
         "schema": schema, "expectedSchema": EXPECTED_SCHEMA, "compatible": compatible},
        f"DB:         {path}\n"
        f"Schema:     {schema}" + ("" if compatible else f"  (CLI erwartet {EXPECTED_SCHEMA} — Befehle brechen ab)") + "\n"
        f"Sandbox:    {'JA' if sandbox else 'nein'}\n"
        f"Rechnungen: {n_inv}  ·  Kunden: {n_cust}\n"
        f"Sidecar:    {exe or 'nicht verfügbar'}",
    )


def customer_dict(r) -> dict:
    return {
        "id": r["id"], "customerNumber": r["customer_number"], "name": r["name"],
        "contactPerson": r["contact_person"], "street": r["street"], "postalCode": r["postal_code"],
        "city": r["city"], "country": r["country"], "email": r["email"], "phone": r["phone"],
        "vatId": r["vat_id"], "leitwegId": r["leitweg_id"],
    }


def cmd_customers(_args) -> None:
    with connect() as con:
        rows = con.execute("SELECT * FROM customers ORDER BY id").fetchall()
    text = "\n".join(
        f"{c['id']:>3}  {c['customer_number']:<8} {c['name']:<40} {c['city'] or '':<20} {c['email'] or ''}"
        for c in rows
    ) or "Keine Kunden."
    emit({"customers": [customer_dict(c) for c in rows]}, text)


def next_customer_number(con) -> str:
    """Spiegel von nextPrefixedNumber() in queries.ts: höchster numerischer Suffix + 1."""
    highest = 0
    for (number,) in con.execute("SELECT customer_number FROM customers WHERE customer_number LIKE 'K-%'"):
        try:
            highest = max(highest, int(number[2:]))
        except ValueError:
            pass
    return f"K-{highest + 1:04d}"


def cmd_customer_create(args) -> None:
    if not args.name.strip():
        sys.exit("--name darf nicht leer sein.")
    with connect() as con:
        def create() -> int:
            number = args.number or next_customer_number(con)
            if con.execute("SELECT 1 FROM customers WHERE customer_number = ?", (number,)).fetchone():
                sys.exit(f"Kundennummer {number} ist bereits vergeben.")
            cur = con.execute(
                """INSERT INTO customers
                   (customer_number, name, contact_person, street, postal_code, city, country, email, phone, vat_id,
                    notes, leitweg_id, receives_xrechnung)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (number, args.name.strip(), args.contact_person, args.street or "", args.postal_code or "",
                 args.city or "", args.country or "DE", args.email, args.phone, args.vat_id, args.notes,
                 args.leitweg_id, 1 if args.receives_xrechnung else 0),
            )
            con.commit()
            return cur.lastrowid

        customer_id, reused = create_once(con, "customer", "customers", args.idempotency_key, create)
        row = con.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    emit(
        {"customer": customer_dict(row), "reused": reused},
        f"Kunde {'vorhanden' if reused else 'angelegt'}: id={customer_id}  {row['customer_number']}  {row['name']}"
        + reuse_note(reused, args.idempotency_key),
    )


def resolve_customer(con, ref: str) -> sqlite3.Row:
    row = con.execute(
        "SELECT * FROM customers WHERE id = ? OR customer_number = ? OR name = ? COLLATE NOCASE",
        (int(ref) if ref.isdigit() else -1, ref, ref),
    ).fetchone()
    if not row:
        sys.exit(f"Kunde nicht gefunden: {ref} (siehe 'zettel-cli customers')")
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
    if args.overdue:
        cond.append(f"status IN ('sent','partial') AND due_date < ? AND (is_credit_note IS NULL OR is_credit_note = 0) AND NOT {SETTLED_BY_CREDIT_NOTE_SQL}")
        params.append(now_unix())
    if cond:
        q += " WHERE " + " AND ".join(cond)
    q += " ORDER BY id DESC"
    with connect() as con:
        rows = con.execute(q, params).fetchall()
        levels: dict[int, list[int]] = {}
        for r in con.execute("SELECT invoice_id, level FROM reminders ORDER BY level"):
            levels.setdefault(r["invoice_id"], []).append(r["level"])
    now = now_unix()
    text = "\n".join(
        f"{r['id']:>3}  {display_number(r['number'], r['status']):<15} "
        f"{fmt_date(r['issue_date'])}  {fmt_money(r['total'], r['currency']):>12}  {r['status']:<9} "
        f"{'PDF' if r['pdf_path'] else '—':<3} fällig {fmt_date(r['due_date'])}"
        for r in rows
    )
    emit({"invoices": [
        {**inv_dict(r), "reminderLevels": levels.get(r["id"], []),
         "daysOverdue": max(0, (now - r["due_date"]) // SECONDS_PER_DAY) if r["due_date"] else 0}
        for r in rows
    ]}, text)


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


# Spiegel von src/lib/db/seals.ts: Hash-Kette über ausgestellte Rechnungen (GoBD).
# Das Format ist durch sidecar/tests/fixtures/invoice-seal.json festgelegt.
GENESIS_HASH = "0" * 64
SEAL_DOCUMENT_TAG = "zettel-invoice-seal"
SEAL_FORMAT_VERSION = 1
SEAL_APPEND_ATTEMPTS = 3
SEALED_INVOICE_COLUMNS = (
    "number", "customer_id", "customer_snapshot", "issue_date", "delivery_date", "due_date",
    "subtotal", "vat_amount", "total", "is_kleinunternehmer", "is_reverse_charge",
    "reverse_charge_type", "supply_kind", "notes", "payment_terms", "is_credit_note",
    "corrects_invoice_id", "currency", "exchange_rate", "eur_total_cent", "service_period_start",
    "service_period_end", "skonto_percent", "skonto_days", "pdf_language", "buyer_reference",
)
SEALED_ITEM_COLUMNS = (
    "position", "description", "quantity", "unit", "unit_price", "vat_rate", "line_total",
    "long_description", "line_period_start", "line_period_end",
)


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def js_number(value: float) -> str:
    """Rendert eine Zahl wie JavaScripts Number.prototype.toString (kürzeste Round-Trip-Ziffern,
    Dezimalschreibweise für Exponenten -7 < e < 21), damit Python und JS dieselben Bytes hashen."""
    if value == 0:
        return "0"
    sign, digits, exponent = Decimal(repr(value)).as_tuple()
    digits_text = "".join(map(str, digits)).rstrip("0")
    point = exponent + len(digits)
    count = len(digits_text)
    if count <= point <= 21:
        body = digits_text + "0" * (point - count)
    elif 0 < point <= 21:
        body = f"{digits_text[:point]}.{digits_text[point:]}"
    elif -6 < point <= 0:
        body = f"0.{'0' * -point}{digits_text}"
    else:
        mantissa = digits_text[0] + (f".{digits_text[1:]}" if count > 1 else "")
        body = f"{mantissa}e{'+' if point > 0 else '-'}{abs(point - 1)}"
    return f"-{body}" if sign else body


def canonical_json(value) -> str:
    """JSON ohne Whitespace wie JSON.stringify; json.dumps formatiert Floats selbst (repr), daher hier Zahlen zuerst."""
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(element) for element in value) + "]"
    if isinstance(value, float):
        return js_number(value)
    return json.dumps(value, ensure_ascii=False)


def canonical_seal_document(invoice: dict, items: list[dict]) -> str:
    return canonical_json([
        SEAL_DOCUMENT_TAG,
        SEAL_FORMAT_VERSION,
        [invoice[column] for column in SEALED_INVOICE_COLUMNS],
        [[item[column] for column in SEALED_ITEM_COLUMNS] for item in items],
    ])


def seal_content_hash(invoice: dict, items: list[dict]) -> str:
    return sha256_hex(canonical_seal_document(invoice, items))


def seal_chain_hash(prev_hash: str, invoice_id: int, kind: str, sealed_at: int, content_hash: str) -> str:
    return sha256_hex(f"{prev_hash}|{invoice_id}|{kind}|{sealed_at}|{content_hash}")


def append_seal_once(con, invoice_id: int, kind: str) -> None:
    invoice = {c: v for c, v in zip(SEALED_INVOICE_COLUMNS, con.execute(
        f"SELECT {', '.join(SEALED_INVOICE_COLUMNS)} FROM invoices WHERE id = ?", (invoice_id,)
    ).fetchone())}
    items = [
        dict(zip(SEALED_ITEM_COLUMNS, row))
        for row in con.execute(
            f"SELECT {', '.join(SEALED_ITEM_COLUMNS)} FROM invoice_items WHERE invoice_id = ? ORDER BY position, id",
            (invoice_id,),
        )
    ]
    content_hash = seal_content_hash(invoice, items)
    last = con.execute("SELECT hash FROM invoice_seals ORDER BY id DESC LIMIT 1").fetchone()
    prev_hash = last[0] if last else GENESIS_HASH
    sealed_at = now_unix()
    con.execute(
        "INSERT INTO invoice_seals (invoice_id, kind, sealed_at, content_hash, prev_hash, hash) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (invoice_id, kind, sealed_at, content_hash, prev_hash,
         seal_chain_hash(prev_hash, invoice_id, kind, sealed_at, content_hash)),
    )


def append_seal(con, invoice_id: int, kind: str) -> None:
    """Versiegelt den aktuellen Inhalt. Ein parallel angehängtes Siegel lässt prev_hash kollidieren: Kette neu lesen."""
    for attempt in range(1, SEAL_APPEND_ATTEMPTS + 1):
        try:
            append_seal_once(con, invoice_id, kind)
            return
        except sqlite3.IntegrityError:
            if attempt == SEAL_APPEND_ATTEMPTS:
                raise


def seal_issued_invoice(con, invoice_id: int) -> None:
    """Die Rechnung ist bereits ausgestellt; ein fehlgeschlagenes Siegel macht das nicht rückgängig,
    die App holt es beim nächsten Start nach."""
    try:
        append_seal(con, invoice_id, "issue")
    except sqlite3.Error as error:
        print(
            f"Warnung: Rechnung {invoice_id} konnte nicht versiegelt werden ({error}); "
            "die App holt das beim nächsten Start nach.",
            file=sys.stderr,
        )


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
    seal_issued_invoice(con, invoice_id)
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


def pdf_output_dir(folder: str = "Rechnungen") -> Path:
    return documents_root() / folder


def generate_pdf_for(con, invoice_id: int) -> tuple[str, str]:
    require_complete_company(dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone()))
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


def export_xrechnung_for(con, invoice_id: int) -> tuple[str, str]:
    """Spiegel von exportInvoiceXrechnung(): XML neben dem PDF, oder Abbruch mit der Liste fehlender Angaben."""
    inv, items, cust = load_invoice_full(con, invoice_id)
    if is_draft_number(inv["number"]):
        sys.exit("Entwürfe können nicht als XRechnung exportiert werden. Bitte die Rechnung erst ausstellen (invoice:issue).")
    settings = dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone())
    live = con.execute("SELECT leitweg_id, email FROM customers WHERE id = ?", (inv["customer_id"],)).fetchone()
    buyer_reference, cust = with_live_customer_fallbacks(inv["buyer_reference"], cust, live)
    inv = {**inv, "buyer_reference": buyer_reference}
    missing = missing_xrechnung_fields(buyer_reference, settings, cust)
    if missing:
        sys.exit("Für die XRechnung fehlen Angaben:\n" + "\n".join(f"  - {label}" for label in missing))
    out_dir = pdf_output_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    output_path = out_dir / f"{safe_filename(inv['number'])}.xml"
    resp = call_sidecar("generate_xrechnung", build_pdf_payload(inv, items, cust, settings, str(output_path)))
    if not resp.get("success"):
        err = resp.get("error", {})
        sys.exit(f"XRechnung-Fehler [{err.get('code')}]: {err.get('message')}\n{err.get('details', '')[:ERROR_DETAIL_CHARS]}")
    return inv["number"], resp["xmlPath"]


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
                "quantity": round_quantity(qty),
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
            service_period_start, service_period_end, skonto_percent, skonto_days, pdf_language,
            buyer_reference)
           VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL,
                   ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)""",
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
            (customer["leitweg_id"] or "").strip() or None,
        ),
    )
    return cur.lastrowid


def insert_line_items(con, table: str, fk: str, doc_id: int, items: list[dict]) -> None:
    for position, it in enumerate(items, start=1):
        con.execute(
            f"""INSERT INTO {table}
               ({fk}, position, description, quantity, unit, unit_price, vat_rate, line_total,
                long_description, line_period_start, line_period_end)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc_id,
                position,
                it["description"],
                it["quantity"],
                it["unit"],
                it["unitPrice"],
                it["vatRate"],
                compute_line_total(it["quantity"], it["unitPrice"]),
                it.get("longDescription"),
                it.get("linePeriodStart"),
                it.get("linePeriodEnd"),
            ),
        )


def insert_invoice_items(con, invoice_id: int, items: list[dict]) -> None:
    insert_line_items(con, "invoice_items", "invoice_id", invoice_id, items)


def cmd_invoice_create(args) -> None:
    items = parse_items_arg(args.items)
    if not items:
        sys.exit("Keine Positionen angegeben (siehe --items).")
    require_exchange_rate(args)
    if args.pdf:
        with connect() as con:
            require_complete_company(dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone()))
    with connect() as con:
        def create() -> int:
            settings = dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone())
            customer = resolve_customer(con, args.customer)
            is_reverse_charge = args.reverse_charge != "none"
            totals = compute_totals(items, bool(settings["is_kleinunternehmer"]), is_reverse_charge)
            invoice_id = insert_draft_invoice(con, args, customer, settings, totals, is_reverse_charge)
            insert_invoice_items(con, invoice_id, items)
            con.commit()
            return invoice_id

        invoice_id, reused = create_once(con, "invoice", "invoices", args.idempotency_key, create)
        inv = fetch_invoice(con, invoice_id)
        lines = [
            f"Draft {'vorhanden' if reused else 'erstellt'}: id={invoice_id}  "
            f"{fmt_money(inv['total'], inv['currency'])}  Kunde: {snapshot_of(inv['customer_snapshot']).get('name')}"
            + reuse_note(reused, args.idempotency_key)
        ]
        if args.issue:
            lines.append(f"Bereitgestellt: {issue_invoice(con, invoice_id)}")
        if args.pdf:
            if reused and inv["pdf_path"]:
                lines.append("PDF bereits vorhanden — nicht neu erzeugt.")
            else:
                lines.append(f"PDF: {generate_pdf_for(con, invoice_id)[1]}")
        inv = fetch_invoice(con, invoice_id)
    emit({"invoice": inv_dict(inv), "reused": reused}, "\n".join(lines))


def require_exchange_rate(args) -> None:
    if args.currency != BASE_CURRENCY and parse_exchange_rate_scaled(args.exchange_rate) is None:
        sys.exit(f"Wechselkurs erforderlich für {args.currency}: --exchange-rate (1 EUR = X {args.currency}).")


def cmd_invoice_show(args) -> None:
    with connect() as con:
        inv, items, cust = load_invoice_full(con, args.id)
    currency = inv["currency"]
    lines = [
        f"Rechnung {display_number(inv['number'], inv['status'])}  [{inv['status']}]",
        f"Kunde:        {cust.get('name')} ({cust.get('customerNumber')})",
        f"Datum:        {fmt_date(inv['issue_date'])}  ·  fällig {fmt_date(inv['due_date'])}",
    ]
    if inv["service_period_start"]:
        lines.append(f"Leistung:     {fmt_date(inv['service_period_start'])} – {fmt_date(inv['service_period_end'])}")
    lines += [f"Zahlungsziel: {inv['payment_terms'] or '—'}", "", *print_items(items, currency), "",
              f"Netto: {fmt_money(inv['subtotal'], currency)}  ·  USt: {fmt_money(inv['vat_amount'], currency)}  "
              f"·  Gesamt: {fmt_money(inv['total'], currency)}"]
    if inv["pdf_path"]:
        lines.append(f"PDF:   {inv['pdf_path']}")
    emit(
        {"invoice": {**inv_dict(inv), "subtotalCent": inv["subtotal"], "vatAmountCent": inv["vat_amount"],
                     "amountPaidCent": inv["amount_paid_cent"] or 0, "paymentTerms": inv["payment_terms"],
                     "servicePeriodStart": iso(inv["service_period_start"]),
                     "servicePeriodEnd": iso(inv["service_period_end"]), "items": items_dict(items)}},
        "\n".join(lines),
    )


def cmd_invoice_pdf(args) -> None:
    with connect() as con:
        number, path = generate_pdf_for(con, args.id)
    emit({"number": number, "pdfPath": path}, f"{number}: {path}")


def cmd_invoice_xrechnung(args) -> None:
    with connect() as con:
        number, path = export_xrechnung_for(con, args.id)
    emit({"number": number, "xmlPath": path}, f"{number}: {path}")


def cmd_invoice_issue(args) -> None:
    with connect() as con:
        number = issue_invoice(con, args.id, parse_date(args.sent_at))
    emit({"id": args.id, "number": number}, f"Bereitgestellt: {number}")


# Spiegel von creditedCentSql() in src/lib/db/invoice-lifecycle.ts: nur ausgestellte
# Stornorechnungen in der Währung der Rechnung zählen, ein Storno-Entwurf nicht.
# Storno-Beträge sind negativ.
CREDITED_CENT_SQL = """(SELECT ABS(COALESCE(SUM(credit_note.total), 0)) FROM invoices credit_note
   WHERE credit_note.corrects_invoice_id = invoices.id
     AND credit_note.is_credit_note = 1
     AND credit_note.currency = invoices.currency
     AND credit_note.status NOT IN ('draft','cancelled'))"""

# Spiegel von settledByCreditNoteSql(): ausgeglichen erst, wenn Zahlungen und
# Stornorechnungen nichts mehr offen lassen. Ein Teilstorno lässt den Rest offen.
SETTLED_BY_CREDIT_NOTE_SQL = f"""({CREDITED_CENT_SQL} > 0
  AND ABS(total) - COALESCE(amount_paid_cent, 0) - {CREDITED_CENT_SQL} <= 0)"""


def credited_cent(con, invoice_id: int) -> int:
    return con.execute(f"SELECT {CREDITED_CENT_SQL} FROM invoices WHERE id = ?", (invoice_id,)).fetchone()[0]


def mark_invoice_paid(con, invoice_id: int, paid_at: int) -> sqlite3.Row | None:
    """Spiegel von markPaid(): zahlt den nach Zahlungen und Storno offenen Rest nur bei sent/partial, sonst None."""
    if fetch_invoice(con, invoice_id)["status"] == "draft":
        issue_invoice(con, invoice_id, paid_at)
    inv = fetch_invoice(con, invoice_id)
    if inv["status"] not in PAYABLE_STATUSES:
        return None
    paid_before = con.execute(
        "SELECT COALESCE(SUM(amount_cent), 0) FROM invoice_payments WHERE invoice_id = ?", (invoice_id,)
    ).fetchone()[0]
    credited = credited_cent(con, invoice_id)
    remaining = abs(inv["total"]) - paid_before - credited
    if credited > 0 and remaining <= 0:
        sys.exit(
            f"Rechnung {inv['number']} ist durch eine Stornorechnung ausgeglichen. "
            "Zahlungen können nicht mehr erfasst werden."
        )
    if remaining > 0:
        con.execute(
            "INSERT INTO invoice_payments (invoice_id, paid_at, amount_cent, source) VALUES (?, ?, ?, 'auto')",
            (invoice_id, paid_at, remaining),
        )
    con.execute(
        f"UPDATE invoices SET status = 'paid', paid_at = ?, amount_paid_cent = ?, updated_at = {SQL_NOW} "
        "WHERE id = ? AND status IN ('sent','partial')",
        (paid_at, paid_before + max(remaining, 0), invoice_id),
    )
    con.commit()
    return inv


def cmd_invoice_paid(args) -> None:
    with connect() as con:
        inv = mark_invoice_paid(con, args.id, parse_date(args.paid_at) or now_unix())
        if inv is None:
            status = fetch_invoice(con, args.id)["status"]
            sys.exit(f"Rechnung {args.id} hat Status '{status}' und kann nicht als bezahlt markiert werden.")
    emit(
        {"id": args.id, "number": inv["number"], "totalCent": abs(inv["total"]), "status": "paid"},
        f"Als bezahlt markiert: {inv['number']} ({fmt_money(abs(inv['total']), inv['currency'])})",
    )



# ----------------------------------------------------------------------------
# Angebote (Spiegel von src/lib/db/offers.ts)
# ----------------------------------------------------------------------------


def offer_dict(r) -> dict:
    return {
        "id": r["id"], "number": r["number"], "status": r["status"],
        "customer": snapshot_of(r["customer_snapshot"]).get("name"),
        "issueDate": iso(r["issue_date"]), "validUntil": iso(r["valid_until"]),
        "totalCent": r["total"], "currency": r["currency"] or BASE_CURRENCY, "pdfPath": r["pdf_path"],
        "convertedInvoiceId": r["converted_invoice_id"],
    }


def fetch_offer(con, offer_id: int) -> sqlite3.Row:
    row = con.execute("SELECT * FROM offers WHERE id = ?", (offer_id,)).fetchone()
    if not row:
        sys.exit(f"Angebot {offer_id} nicht gefunden.")
    return row


def fetch_offer_items(con, offer_id: int) -> list[sqlite3.Row]:
    return con.execute("SELECT * FROM offer_items WHERE offer_id = ? ORDER BY position", (offer_id,)).fetchall()


def create_offer(con, args, items: list[dict]) -> int:
    settings = dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone())
    customer = resolve_customer(con, args.customer)
    is_reverse_charge = args.reverse_charge != "none"
    totals = compute_totals(items, bool(settings["is_kleinunternehmer"]), is_reverse_charge)
    issue_ts = parse_date(args.issue_date) or now_unix()
    valid_days = settings["default_offer_validity_days"] or DEFAULT_OFFER_VALIDITY_DAYS
    valid_ts = parse_date(args.valid_until) or add_days_unix(issue_ts, valid_days)
    skonto_percent, skonto_days = resolve_skonto(args, settings)
    pdf_language = args.pdf_language or settings.get("default_pdf_language") or DEFAULT_PDF_LANGUAGE
    number = draw_next_number(con, "offer", issue_ts)
    cur = con.execute(
        """INSERT INTO offers
           (number, customer_id, customer_snapshot, issue_date, valid_until, status, subtotal, vat_amount, total,
            is_kleinunternehmer, is_reverse_charge, reverse_charge_type, supply_kind, notes, intro_text, currency,
            exchange_rate, service_period_start, service_period_end, skonto_percent, skonto_days, pdf_language)
           VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (number, customer["id"], json.dumps(customer_snapshot(customer), ensure_ascii=False), issue_ts, valid_ts,
         totals["subtotal"], totals["vatAmount"], totals["total"], 1 if settings["is_kleinunternehmer"] else 0,
         1 if is_reverse_charge else 0, args.reverse_charge, args.supply_kind, args.notes, args.intro_text,
         args.currency, args.exchange_rate, parse_date(args.service_start), parse_date(args.service_end),
         skonto_percent, skonto_days, pdf_language),
    )
    insert_line_items(con, "offer_items", "offer_id", cur.lastrowid, items)
    con.commit()
    return cur.lastrowid


def cmd_offer_list(args) -> None:
    cond, params = [], []
    if args.status:
        cond.append("status = ?")
        params.append(args.status)
    if args.year:
        cond.append("CAST(strftime('%Y', issue_date, 'unixepoch', 'localtime') AS INT) = ?")
        params.append(args.year)
    query = "SELECT * FROM offers" + (" WHERE " + " AND ".join(cond) if cond else "") + " ORDER BY id DESC"
    with connect() as con:
        rows = con.execute(query, params).fetchall()
    text = "\n".join(
        f"{r['id']:>3}  {r['number']:<15} {fmt_date(r['issue_date'])}  {fmt_money(r['total'], r['currency']):>12}  "
        f"{r['status']:<9} {'PDF' if r['pdf_path'] else '—':<3} gültig bis {fmt_date(r['valid_until'])}"
        for r in rows
    )
    emit({"offers": [offer_dict(r) for r in rows]}, text)


def cmd_offer_create(args) -> None:
    items = parse_items_arg(args.items)
    if not items:
        sys.exit("Keine Positionen angegeben (siehe --items).")
    require_exchange_rate(args)
    with connect() as con:
        if args.pdf:
            require_complete_company(dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone()))
        offer_id, reused = create_once(
            con, "offer", "offers", args.idempotency_key, lambda: create_offer(con, args, items),
        )
        lines = [f"Angebot {'vorhanden' if reused else 'erstellt'}: id={offer_id}" + reuse_note(reused, args.idempotency_key)]
        if args.pdf:
            if reused and fetch_offer(con, offer_id)["pdf_path"]:
                lines.append("PDF bereits vorhanden — nicht neu erzeugt.")
            else:
                lines.append(f"PDF: {generate_document_pdf(con, 'offer', offer_id)[1]}")
        offer = fetch_offer(con, offer_id)
    lines.append(
        f"{offer['number']}  Gesamt: {fmt_money(offer['total'], offer['currency'])}  gültig bis {fmt_date(offer['valid_until'])}"
    )
    emit({"offer": offer_dict(offer), "reused": reused}, "\n".join(lines))


def cmd_offer_show(args) -> None:
    with connect() as con:
        offer = fetch_offer(con, args.id)
        items = fetch_offer_items(con, args.id)
    currency = offer["currency"]
    lines = [
        f"Angebot {offer['number']}  [{offer['status']}]",
        f"Kunde:        {snapshot_of(offer['customer_snapshot']).get('name')}",
        f"Datum:        {fmt_date(offer['issue_date'])}  ·  gültig bis {fmt_date(offer['valid_until'])}",
        "", *print_items(items, currency), "",
        f"Netto: {fmt_money(offer['subtotal'], currency)}  ·  USt: {fmt_money(offer['vat_amount'], currency)}  "
        f"·  Gesamt: {fmt_money(offer['total'], currency)}",
    ]
    if offer["converted_invoice_id"]:
        lines.append(f"Umgewandelt in Rechnung id={offer['converted_invoice_id']}")
    if offer["pdf_path"]:
        lines.append(f"PDF:   {offer['pdf_path']}")
    emit({"offer": {**offer_dict(offer), "subtotalCent": offer["subtotal"], "vatAmountCent": offer["vat_amount"],
                    "introText": offer["intro_text"], "notes": offer["notes"], "items": items_dict(items)}},
         "\n".join(lines))


def offer_transition(status: str, stamp: str, allowed: tuple[str, ...]):
    """Statuswechsel wie markSent/markAccepted/markRejected; gleicher Zielstatus ist ein No-op."""
    def run(args) -> None:
        with connect() as con:
            offer = fetch_offer(con, args.id)
            changed = offer["status"] != status
            if changed:
                if offer["status"] not in allowed:
                    sys.exit(f"Angebot {offer['number']}: Übergang '{offer['status']}' -> '{status}' nicht erlaubt.")
                con.execute(
                    f"UPDATE offers SET status = ?, {stamp} = {SQL_NOW}, updated_at = {SQL_NOW} WHERE id = ?",
                    (status, args.id),
                )
                con.commit()
            result = fetch_offer(con, args.id)
        emit({"offer": offer_dict(result), "changed": changed},
             f"Angebot {offer['number']}: {'jetzt' if changed else 'bereits'} {status}")
    return run


def convert_offer(con, offer_id: int, payment_terms: int | None) -> tuple[int, bool]:
    """Spiegel von convertToInvoice(): (Rechnungs-id, bereits umgewandelt). Eine zweite Umwandlung liefert die erste."""
    offer = fetch_offer(con, offer_id)
    if offer["converted_invoice_id"]:
        return offer["converted_invoice_id"], True
    if offer["status"] == "rejected":
        sys.exit("Abgelehnte Angebote können nicht umgewandelt werden.")
    settings = dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone())
    customer = con.execute("SELECT * FROM customers WHERE id = ?", (offer["customer_id"],)).fetchone()
    if not customer:
        sys.exit(f"Kunde {offer['customer_id']} des Angebots {offer['number']} nicht gefunden.")
    items = [
        {"description": r["description"], "quantity": r["quantity"], "unit": r["unit"], "unitPrice": r["unit_price"],
         "vatRate": r["vat_rate"], "longDescription": r["long_description"],
         "linePeriodStart": r["line_period_start"], "linePeriodEnd": r["line_period_end"]}
        for r in fetch_offer_items(con, offer_id)
    ]
    reverse_charge = stored_reverse_charge_type(offer["reverse_charge_type"], bool(offer["is_reverse_charge"]))
    is_reverse_charge = reverse_charge != "none"
    totals = compute_totals(items, bool(settings["is_kleinunternehmer"]), is_reverse_charge)
    has_skonto = offer["skonto_percent"] is not None and offer["skonto_days"] is not None
    args = argparse.Namespace(
        issue_date=None, due_date=None, delivery_date=None, payment_terms=payment_terms,
        reverse_charge=reverse_charge, supply_kind=offer["supply_kind"], notes=offer["notes"],
        service_start=offer["service_period_start"], service_end=offer["service_period_end"],
        skonto_percent=offer["skonto_percent"], skonto_days=offer["skonto_days"], no_skonto=not has_skonto,
        pdf_language=offer["pdf_language"], currency=offer["currency"] or BASE_CURRENCY,
        exchange_rate=offer["exchange_rate"],
    )
    invoice_id = insert_draft_invoice(con, args, customer, settings, totals, is_reverse_charge)
    insert_invoice_items(con, invoice_id, items)
    linked = con.execute(
        f"UPDATE offers SET status = 'accepted', accepted_at = COALESCE(accepted_at, {SQL_NOW}), "
        f"converted_invoice_id = ?, updated_at = {SQL_NOW} "
        "WHERE id = ? AND converted_invoice_id IS NULL AND status != 'rejected'",
        (invoice_id, offer_id),
    ).rowcount
    if linked == 1:
        con.commit()
        return invoice_id, False
    con.rollback()
    winner = fetch_offer(con, offer_id)["converted_invoice_id"]
    if winner is None:
        sys.exit("Angebot konnte nicht umgewandelt werden.")
    return winner, True


def cmd_offer_convert(args) -> None:
    with connect() as con:
        offer = fetch_offer(con, args.id)
        invoice_id, reused = convert_offer(con, args.id, args.payment_terms)
        inv = fetch_invoice(con, invoice_id)
    emit({"invoice": inv_dict(inv), "reused": reused},
         f"Angebot {offer['number']} " + ("bereits umgewandelt: " if reused else "-> ")
         + f"Rechnung id={invoice_id} ({fmt_money(inv['total'], inv['currency'])})")


def cmd_offer_pdf(args) -> None:
    with connect() as con:
        number, path = generate_document_pdf(con, "offer", args.id)
    emit({"number": number, "pdfPath": path}, f"{number}: {path}")


# ----------------------------------------------------------------------------
# Mahnungen (Spiegel von src/lib/db/reminders.ts)
# ----------------------------------------------------------------------------


def reminder_invoice_snapshot(invoice: dict) -> dict:
    """Spiegel von buildInvoiceSnapshot()."""
    customer = snapshot_of(invoice["customer_snapshot"])
    return {
        "invoiceNumber": invoice["number"], "invoiceIssueDate": invoice["issue_date"],
        "invoiceDueDate": invoice["due_date"], "customerName": customer.get("name") or "—",
        "customerStreet": customer.get("street") or "", "customerPostalCode": customer.get("postalCode") or "",
        "customerCity": customer.get("city") or "", "customerCountry": customer.get("country") or "DE",
        "customerContactPerson": customer.get("contactPerson"),
    }


def reminder_dict(r) -> dict:
    snapshot = snapshot_of(r["invoice_snapshot"])
    return {
        "id": r["id"], "number": r["number"], "invoiceId": r["invoice_id"],
        "invoiceNumber": snapshot.get("invoiceNumber"), "customer": snapshot.get("customerName"),
        "level": r["level"], "levelLabel": REMINDER_LABELS.get(r["level"]), "status": r["status"],
        "issueDate": iso(r["issue_date"]), "dueDate": iso(r["due_date"]), "feeCent": r["fee_cents"],
        "interestCent": r["interest_cents"], "originalTotalCent": r["original_total_cents"],
        "totalDueCent": r["total_due_cents"], "pdfPath": r["pdf_path"],
    }


def fetch_reminder(con, reminder_id: int) -> sqlite3.Row:
    row = con.execute("SELECT * FROM reminders WHERE id = ?", (reminder_id,)).fetchone()
    if not row:
        sys.exit(f"Mahnung {reminder_id} nicht gefunden.")
    return row


def parse_money(text: str) -> int:
    try:
        return js_round(parse_decimal(text) * CENTS_PER_EUR)
    except ValueError:
        sys.exit(f"Ungültiger Betrag: {text}")


def create_reminder(con, args) -> int:
    inv = fetch_invoice(con, args.invoice)
    if inv["status"] not in PAYABLE_STATUSES:
        sys.exit("Mahnungen können nur für versendete oder teilbezahlte Rechnungen erstellt werden.")
    if inv["is_credit_note"]:
        sys.exit("Für Stornorechnungen können keine Mahnungen erstellt werden.")
    credited = credited_cent(con, inv["id"])
    open_cent = abs(inv["total"]) - (inv["amount_paid_cent"] or 0) - credited
    if credited > 0 and open_cent <= 0:
        sys.exit("Die Rechnung wurde storniert und kann nicht gemahnt werden.")
    settings = dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone())
    level = args.level
    issue_ts = parse_date(args.issue_date) or now_unix()
    due_ts = parse_date(args.due_date) or add_days_unix(issue_ts, settings[f"reminder_days_l{level}"])
    if args.fee is not None:
        fee = parse_money(args.fee)
    else:
        fee = eur_cents_to_currency(settings[f"reminder_fee_l{level}_cents"], inv["currency"], inv["exchange_rate"]) or 0
    interest = parse_money(args.interest) if args.interest is not None else 0
    number = draw_next_number(con, "reminder", issue_ts)
    cur = con.execute(
        """INSERT INTO reminders
           (number, invoice_id, invoice_snapshot, level, issue_date, due_date, fee_cents, interest_cents,
            original_total_cents, total_due_cents, status, body_text, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)""",
        (number, inv["id"], json.dumps(reminder_invoice_snapshot(dict(inv)), ensure_ascii=False), level, issue_ts,
         due_ts, fee, interest, open_cent, open_cent + fee + interest, args.body or settings[f"reminder_text_l{level}"],
         args.notes),
    )
    con.commit()
    return cur.lastrowid


def cmd_reminder_list(args) -> None:
    with connect() as con:
        if args.invoice:
            rows = con.execute("SELECT * FROM reminders WHERE invoice_id = ? ORDER BY id DESC", (args.invoice,)).fetchall()
        else:
            rows = con.execute("SELECT * FROM reminders ORDER BY id DESC").fetchall()
        currencies = {r["id"]: r["currency"] for r in con.execute("SELECT id, currency FROM invoices")}
    text = "\n".join(
        f"{r['id']:>3}  {r['number']:<15} Stufe {r['level']}  Rechnung {snapshot_of(r['invoice_snapshot']).get('invoiceNumber')}  "
        f"{fmt_money(r['total_due_cents'], currencies.get(r['invoice_id'])):>12}  {r['status']:<6} {'PDF' if r['pdf_path'] else '—'}"
        for r in rows
    )
    emit({"reminders": [reminder_dict(r) for r in rows]}, text)


def cmd_reminder_create(args) -> None:
    with connect() as con:
        if args.pdf:
            require_complete_company(dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone()))
        reminder_id, reused = create_once(
            con, "reminder", "reminders", args.idempotency_key, lambda: create_reminder(con, args),
        )
        lines = [f"Mahnung {'vorhanden' if reused else 'erstellt'}: id={reminder_id}" + reuse_note(reused, args.idempotency_key)]
        if args.pdf:
            if reused and fetch_reminder(con, reminder_id)["pdf_path"]:
                lines.append("PDF bereits vorhanden — nicht neu erzeugt.")
            else:
                lines.append(f"PDF: {generate_document_pdf(con, 'reminder', reminder_id)[1]}")
        reminder = fetch_reminder(con, reminder_id)
        currency = fetch_invoice(con, reminder["invoice_id"])["currency"]
    lines.append(
        f"{reminder['number']}  Stufe {reminder['level']}  fällig {fmt_date(reminder['due_date'])}  "
        f"Forderung gesamt {fmt_money(reminder['total_due_cents'], currency)}"
    )
    emit({"reminder": reminder_dict(reminder), "reused": reused}, "\n".join(lines))


def cmd_reminder_send(args) -> None:
    with connect() as con:
        reminder = fetch_reminder(con, args.id)
        changed = reminder["status"] == "draft"
        if changed:
            con.execute(
                f"UPDATE reminders SET status = 'sent', sent_at = ?, updated_at = {SQL_NOW} WHERE id = ? AND status = 'draft'",
                (parse_date(args.sent_at) or now_unix(), args.id),
            )
            con.commit()
        result = fetch_reminder(con, args.id)
    emit({"reminder": reminder_dict(result), "changed": changed},
         f"Mahnung {reminder['number']}: {'jetzt' if changed else 'bereits'} sent")


def cmd_reminder_pdf(args) -> None:
    with connect() as con:
        number, path = generate_document_pdf(con, "reminder", args.id)
    emit({"number": number, "pdfPath": path}, f"{number}: {path}")


def render_pdf(command: str, payload: dict) -> str:
    resp = call_sidecar(command, payload)
    if not resp.get("success"):
        err = resp.get("error", {})
        sys.exit(f"PDF-Fehler [{err.get('code')}]: {err.get('message')}\n{err.get('details', '')[:ERROR_DETAIL_CHARS]}")
    return resp["pdfPath"]


def generate_document_pdf(con, kind: str, doc_id: int) -> tuple[str, str]:
    """PDF für Angebot oder Mahnung über den Sidecar; (Nummer, PDF-Pfad)."""
    table, folder = {"offer": ("offers", "Angebote"), "reminder": ("reminders", "Mahnungen")}[kind]
    row = dict(fetch_offer(con, doc_id) if kind == "offer" else fetch_reminder(con, doc_id))
    company = dict(con.execute("SELECT * FROM settings WHERE id = 1").fetchone())
    require_complete_company(company)
    output_path = pdf_output_dir(folder) / f"{safe_filename(row['number'])}.pdf"
    if kind == "offer":
        payload = build_offer_payload(
            row, [dict(r) for r in fetch_offer_items(con, doc_id)], snapshot_of(row["customer_snapshot"]),
            company, str(output_path),
        )
    else:
        invoice = dict(fetch_invoice(con, row["invoice_id"]))
        snapshot = snapshot_of(row["invoice_snapshot"])
        if not snapshot.get("invoiceNumber"):
            snapshot = reminder_invoice_snapshot(invoice)
        payload = build_reminder_payload(row, invoice, snapshot, company, str(output_path))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    archive_pdf_version(output_path, Path(row["pdf_path"]) if row["pdf_path"] else None)
    pdf_path = render_pdf(f"generate_{kind}", payload)
    con.execute(f"UPDATE {table} SET pdf_path = ?, updated_at = {SQL_NOW} WHERE id = ?", (pdf_path, doc_id))
    con.commit()
    return row["number"], pdf_path


# Spiegel von REVENUE_AMOUNT_SQL / OPEN_BALANCE_SQL / OPEN_RECEIVABLE_SQL in
# src/lib/dashboard/queries.ts: Fremdwährung zählt über den eingefrorenen
# EUR-Gegenwert, der bezahlte und stornierte Anteil wird proportional umgerechnet
# (ganzzahlig, half-up). Stornorechnungen und voll ausgeglichene Rechnungen sind
# keine offenen Forderungen.
REVENUE_AMOUNT_SQL = "COALESCE(eur_total_cent, total)"
COVERED_SQL = f"(COALESCE(amount_paid_cent, 0) + {CREDITED_CENT_SQL})"
OPEN_BALANCE_SQL = f"""(CASE
  WHEN eur_total_cent IS NULL OR total = 0 THEN total - {COVERED_SQL}
  ELSE eur_total_cent - (2 * eur_total_cent * {COVERED_SQL} + total) / (2 * total)
END)"""
OPEN_RECEIVABLE_SQL = f"""status IN ('sent','partial')
  AND (is_credit_note IS NULL OR is_credit_note = 0)
  AND NOT {SETTLED_BY_CREDIT_NOTE_SQL}"""


def compute_stats(con, year: int) -> tuple[int, int, int]:
    """(Umsatz des Jahres, Anzahl offener Rechnungen, offener Saldo) in EUR-Cent."""
    revenue = con.execute(
        f"SELECT COALESCE(SUM({REVENUE_AMOUNT_SQL}),0) FROM invoices "
        "WHERE status NOT IN ('cancelled','draft') "
        "AND strftime('%Y', issue_date, 'unixepoch', 'localtime') = ?",
        (str(year),),
    ).fetchone()[0]
    open_count, open_total = con.execute(
        f"SELECT COUNT(*), COALESCE(SUM({OPEN_BALANCE_SQL}),0) FROM invoices WHERE {OPEN_RECEIVABLE_SQL}"
    ).fetchone()
    return revenue, open_count, open_total


def cmd_stats(_args) -> None:
    year = datetime.now().year
    with connect() as con:
        revenue, open_count, open_total = compute_stats(con, year)
    emit(
        {"year": year, "revenueCent": revenue, "openCount": open_count, "openCent": open_total},
        f"Umsatz {year} (ohne Entwurf/Storno): {fmt_eur(revenue)}\nOffene Forderungen: {open_count} · {fmt_eur(open_total)}",
    )


GUIDE = """\
Headless-Steuerung der Zettel-DB (Rechnungen, Angebote, Mahnungen, Kunden für deutsche Freelancer).
Ausgabe ist deutscher Klartext. Mit --json (vor oder nach dem Befehl) kommt genau EIN JSON-Objekt auf stdout:
{"ok": true, ...Daten} bzw. {"ok": false, "error": "..."} mit Exit-Code 1. In JSON sind Beträge Cent-Integer
(*Cent), Daten ISO YYYY-MM-DD. Zuerst `status` aufrufen: zeigt DB, Schema-Kompatibilität und Sidecar.

TYPISCHER ABLAUF
  Rechnung   customers -> invoice:create -> invoice:issue -> invoice:pdf -> invoice:paid
             Kurzform: invoice:create ... --pdf   (impliziert Ausstellen)
  Angebot    offer:create -> offer:send -> offer:accept -> offer:convert (erzeugt Rechnungsentwurf)
  Mahnung    invoices --overdue -> reminder:create --invoice <id> --level 1 -> reminder:send / reminder:pdf
  Kunde      customer:create --name "ACME GmbH" --city Berlin   (Nummer K-0001 wird vergeben)
  Beispiel   zettel-cli invoice:create --customer K-0001 --items "Beratung|2|Std|90|19" \\
                 --idempotency-key mai-beratung --json

IDEMPOTENZ  (wichtig bei Automatisierung und Wiederholungen)
  * Alle *:create-Befehle akzeptieren --idempotency-key <String>. Gleicher Schlüssel (pro DB und Typ) legt
    NICHTS neu an und liefert den bestehenden Datensatz ("reused": true). Immer setzen, wenn ein Aufruf
    wiederholt werden könnte (Timeout, Retry, Neustart eines Agenten).
  * Ohne Schlüssel legt jeder Aufruf einen neuen Datensatz an (bei Angeboten und Mahnungen verbraucht das eine Nummer).
  * Die Schlüssel liegen in <AppData>/cli-idempotency.json, nicht in der DB. Nach einem Restore oder Wipe
    werden alte Schlüssel erkannt und ignoriert.
  * Von Natur aus wiederholbar: invoice:issue, invoice:paid, offer:send/accept/reject, reminder:send,
    offer:convert (liefert die bereits erzeugte Rechnung). PDF-Befehle erzeugen immer neu (altes PDF -> Versionen/).

SCHEMA-SCHUTZ
  Alle Befehle außer `status` brechen ab, wenn die DB ein anderes Schema hat als diese CLI erwartet
  (PRAGMA user_version). Dann App und CLI auf dieselbe Version bringen.

WICHTIG
  * <id> ist immer die DB-id aus *:create bzw. den Listen, NICHT die Dokumentnummer. Rechnungsentwürfe haben
    noch keine Nummer ("Entwurf #abcd"); sie wird erst bei issue/pdf/paid gezogen. Angebote und Mahnungen
    bekommen ihre Nummer sofort.
  * Mahnungen nur für Rechnungen mit Status 'sent' oder 'partial', nicht für Stornorechnungen oder per Storno
    ausgeglichene Rechnungen. Die Forderung ist der offene Rest.
  * Ausgestellte Rechnungen sind gesperrt (GoBD-Siegel). Korrekturen nur per Storno in der App.
  * Nicht möglich: Dokumente bearbeiten/löschen/stornieren, Kunden ändern, Ausgaben, Einstellungen.
  * PDFs brauchen vollständige Firmendaten (Name, Anschrift, Steuernummer oder USt-IdNr.).

FORMATE
  --items   'Beschreibung|Menge|Einheit|Preis-in-EUR[|MwSt-%][|Langtext]', Positionen mit ';'
            Menge/Preis mit Punkt oder Komma. Einheit leer = "Std". MwSt-% ganzzahlig und OPTIONAL mit
            Default 0, für 19 % also ausdrücklich "19". Bei Kleinunternehmer oder Reverse-Charge ist die MwSt 0.
  Datum     YYYY-MM-DD, TT.MM.JJJJ oder Unix-Timestamp. Default Ausstellungsdatum: heute.
  --customer  DB-id, Kundennummer (K-0001) oder exakter Name.
  --fee/--interest (Mahnung)  Betrag in der Währung der Rechnung.

DATENBANK / UMGEBUNG
  DB-Auswahl wie die App: sandbox.flag -> zettel-sandbox.db, sonst aktiver Mandant, sonst zettel.db.
  Nicht parallel zur laufenden App SCHREIBEN (SQLite single-writer). PDFs brauchen den Sidecar:
  ZETTEL_SIDECAR=<Pfad zu zettel-sidecar> oder installierte App bzw. sidecar/.venv im Repo.
"""


def main() -> None:
    global JSON_MODE
    json_help = "Ausgabe als ein JSON-Objekt (vor oder nach dem Befehl erlaubt)"
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", dest="json_sub", action="store_true", help=json_help)
    ap = argparse.ArgumentParser(prog="zettel-cli", description=GUIDE, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", dest="json_top", action="store_true", help=json_help)
    ap.add_argument("--version", action="version", version=f"zettel-cli (DB-Schema {EXPECTED_SCHEMA})")
    sub = ap.add_subparsers(dest="cmd", required=True, metavar="BEFEHL")

    def add(name, func, help, idem=False):
        p = sub.add_parser(name, help=help, parents=[common])
        if idem:
            p.add_argument("--idempotency-key", help="Wiederholung mit gleichem Schlüssel legt nichts neu an")
        p.set_defaults(func=func)
        return p

    def with_id(name, func, help):
        p = add(name, func, help)
        p.add_argument("id", type=int, help="DB-id (nicht die Dokumentnummer)")
        return p

    def document_options(p, offer: bool) -> None:
        p.add_argument("--customer", required=True, help="ID, Kundennummer oder Name")
        p.add_argument("--items", required=True,
                       help="'Desc|Menge|Einheit|Preis€[|MwSt][|Langtext]' — mehrere mit ; (MwSt-Default 0!)")
        p.add_argument("--issue-date")
        p.add_argument("--service-start")
        p.add_argument("--service-end")
        p.add_argument("--reverse-charge", default="none", choices=["none", "intra_eu", "third_country"])
        p.add_argument("--supply-kind", default="services", choices=["goods", "services"],
                       help="Lieferung oder sonstige Leistung (nur bei Reverse-Charge relevant)")
        p.add_argument("--skonto-percent", type=float, help="Default aus den Settings, falls dort aktiv")
        p.add_argument("--skonto-days", type=int, help="Default aus den Settings, falls dort aktiv")
        p.add_argument("--no-skonto", action="store_true", help="Kein Skonto, auch wenn die Settings es vorbelegen")
        p.add_argument("--pdf-language", choices=["de", "en"], help="Default aus den Settings")
        p.add_argument("--currency", default=BASE_CURRENCY, choices=SUPPORTED_CURRENCIES)
        p.add_argument("--exchange-rate", help="1 EUR = X Fremdwährung (Pflicht außer bei EUR)")
        p.add_argument("--notes")

    add("status", cmd_status, "DB-Pfad, Schema, Sandbox-Flag, Anzahl Rechnungen/Kunden, Sidecar (zuerst aufrufen)")

    add("customers", cmd_customers, "Kunden listen")
    p = add("customer:create", cmd_customer_create, "Kunden anlegen (Nummer K-NNNN automatisch)", idem=True)
    p.add_argument("--name", required=True)
    p.add_argument("--number", help="eigene Kundennummer statt K-NNNN (muss eindeutig sein)")
    p.add_argument("--contact-person")
    p.add_argument("--street")
    p.add_argument("--postal-code")
    p.add_argument("--city")
    p.add_argument("--country", help="ISO-Code, Default DE")
    p.add_argument("--email")
    p.add_argument("--phone")
    p.add_argument("--vat-id", help="USt-IdNr.")
    p.add_argument("--leitweg-id", help="Leitweg-ID für XRechnung")
    p.add_argument("--receives-xrechnung", action="store_true")
    p.add_argument("--notes")

    p = add("invoices", cmd_invoice_list, "Rechnungen listen (neueste zuerst)")
    p.add_argument("--status", choices=["draft", "sent", "partial", "paid", "cancelled"])
    p.add_argument("--year", type=int)
    p.add_argument("--overdue", action="store_true",
                   help="nur überfällige, nicht per Storno ausgeglichene (sent/partial); JSON enthält reminderLevels")

    p = add("invoice:create", cmd_invoice_create, "Rechnungsentwurf anlegen (ohne Nummer)", idem=True)
    document_options(p, offer=False)
    p.add_argument("--due-date")
    p.add_argument("--delivery-date")
    p.add_argument("--payment-terms", type=int, help="Tage (Default aus Settings)")
    p.add_argument("--issue", action="store_true", help="Direkt bereitstellen (Nummer ziehen)")
    p.add_argument("--pdf", action="store_true", help="PDF generieren (impliziert --issue)")

    with_id("invoice:show", cmd_invoice_show, "Rechnung mit Positionen, Summen und PDF-Pfad anzeigen")
    with_id("invoice:pdf", cmd_invoice_pdf, "PDF generieren (Entwurf wird vorher bereitgestellt)")
    with_id("invoice:xrechnung", cmd_invoice_xrechnung, "XRechnung (CII) neben dem PDF erzeugen")
    p = with_id("invoice:issue", cmd_invoice_issue, "Entwurf bereitstellen = Nummer ziehen und versiegeln (sonst No-op)")
    p.add_argument("--sent-at")
    p = with_id("invoice:paid", cmd_invoice_paid, "Als bezahlt markieren")
    p.add_argument("--paid-at")

    p = add("offers", cmd_offer_list, "Angebote listen (neueste zuerst)")
    p.add_argument("--status", choices=["draft", "sent", "accepted", "rejected", "expired"])
    p.add_argument("--year", type=int)
    p = add("offer:create", cmd_offer_create, "Angebotsentwurf anlegen (Nummer AN-… sofort)", idem=True)
    document_options(p, offer=True)
    p.add_argument("--valid-until", help="Gültig bis (Default: Ausstellung + Gültigkeit aus den Settings)")
    p.add_argument("--intro-text", help="Einleitungstext über den Positionen")
    p.add_argument("--pdf", action="store_true", help="PDF generieren (braucht Sidecar)")
    with_id("offer:show", cmd_offer_show, "Angebot mit Positionen und Summen anzeigen")
    with_id("offer:send", offer_transition("sent", "sent_at", ("draft",)), "Als gesendet markieren")
    with_id("offer:accept", offer_transition("accepted", "accepted_at", ("sent", "draft")), "Als angenommen markieren")
    with_id("offer:reject", offer_transition("rejected", "rejected_at", ("sent", "draft")), "Als abgelehnt markieren")
    p = with_id("offer:convert", cmd_offer_convert, "In Rechnungsentwurf umwandeln; Angebot wird 'accepted' (wiederholbar)")
    p.add_argument("--payment-terms", type=int, help="Zahlungsziel in Tagen (Default aus den Settings)")
    with_id("offer:pdf", cmd_offer_pdf, "Angebots-PDF erzeugen")

    p = add("reminders", cmd_reminder_list, "Mahnungen listen (neueste zuerst)")
    p.add_argument("--invoice", type=int, help="nur Mahnungen zu dieser Rechnungs-id")
    p = add("reminder:create", cmd_reminder_create, "Mahnungsentwurf zu einer offenen Rechnung anlegen (Nummer MA-… sofort)", idem=True)
    p.add_argument("--invoice", type=int, required=True, help="DB-id der Rechnung (sent oder partial)")
    p.add_argument("--level", type=int, choices=[1, 2, 3], required=True, help="1 Zahlungserinnerung, 2 Mahnung, 3 Letzte Mahnung")
    p.add_argument("--issue-date")
    p.add_argument("--due-date", help="Default: Ausstellung + Frist der Stufe aus den Settings")
    p.add_argument("--fee", help="Mahngebühr in Rechnungswährung (Default aus den Settings je Stufe)")
    p.add_argument("--interest", help="Verzugszinsen in Rechnungswährung (Default 0)")
    p.add_argument("--body", help="Text (Default: Standardtext der Stufe)")
    p.add_argument("--notes")
    p.add_argument("--pdf", action="store_true", help="PDF generieren (braucht Sidecar)")
    p = with_id("reminder:send", cmd_reminder_send, "Als gesendet markieren")
    p.add_argument("--sent-at")
    with_id("reminder:pdf", cmd_reminder_pdf, "Mahnungs-PDF erzeugen")

    add("stats", cmd_stats, "Umsatz des laufenden Jahres und offene Forderungen")

    args = ap.parse_args()
    JSON_MODE = args.json_top or args.json_sub
    try:
        args.func(args)
    except SystemExit as exit_:
        if JSON_MODE and isinstance(exit_.code, str):
            print(json.dumps({"ok": False, "error": exit_.code}, ensure_ascii=False))
            sys.exit(1)
        raise
    except sqlite3.Error as error:
        message = f"DB-Fehler: {error}"
        if JSON_MODE:
            print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
            sys.exit(1)
        sys.exit(message)


if __name__ == "__main__":
    main()
