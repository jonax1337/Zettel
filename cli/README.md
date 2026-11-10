# Zettel CLI (`cli/zettel.py`)

Headless-Steuerung der Zettel-Datenbank für Automatisierung (z. B. Agenten,
Scripts, Cron). Nur Python-stdlib, keine Abhängigkeiten.

## Mit der App installiert

Der Installer liefert die CLI als `zettel-cli` (PyInstaller-Binary, baut `python cli/build.py`) mit; sie findet den
PDF-Sidecar der Installation selbst. Einstellungen → Daten → „Kommandozeile“ zeigt den Pfad zum Kopieren.

| Plattform | Aufruf |
|---|---|
| Linux (`.deb`) | `zettel-cli` (Symlink nach `/usr/bin`, beim Entfernen des Pakets weg) |
| Linux (AppImage), Windows, macOS | voller Pfad aus den Einstellungen; kein PATH-Eintrag |

Die Beispiele unten laufen aus dem Repo mit `python cli/zettel.py`; installiert ersetzt `zettel-cli` diesen Aufruf.

## DB-Auflösung

Wie die App (`src-tauri/src/tenants.rs`): `sandbox.flag` → Sandbox-DB,
sonst aktiver Tenant aus `tenants.json`, sonst Standard-`zettel.db`.
Unter Linux liegen die eingebauten DBs in `~/.config/digital.laux.zettel/`, `sandbox.flag` und `tenants.json` in `~/.local/share/digital.laux.zettel/`.

**Nicht parallel zur laufenden App schreiben** (SQLite single-writer).
Lesende Befehle sind unproblematisch.

## Befehle

```
python cli/zettel.py status                          # DB, Schema (Ist/Soll), Sandbox, Sidecar
python cli/zettel.py customers                       # Kunden listen
python cli/zettel.py customer:create --name "ACME GmbH" [--city ..] [--leitweg-id ..]  # Nummer K-NNNN
python cli/zettel.py invoices [--status X] [--year N] [--overdue]
python cli/zettel.py invoice:show <id>
python cli/zettel.py invoice:create --customer "ITGG Berlin e.V." \
    --items "IT-Vor-Ort-Service|2|Std|90|0;Remote-Support|1.5|Std|90|0" \
    [--issue-date 2026-08-27] [--issue] [--pdf]
python cli/zettel.py invoice:issue <id>              # Nummer ziehen (lazy) + Rechnung versiegeln
python cli/zettel.py invoice:pdf <id>                # PDF via Sidecar
python cli/zettel.py invoice:xrechnung <id>          # XRechnung (CII) als .xml neben dem PDF
python cli/zettel.py invoice:paid <id>               # bezahlt + Payment-Eintrag
python cli/zettel.py offers [--status X] [--year N]
python cli/zettel.py offer:create --customer K-0001 --items "..." [--valid-until ..] [--pdf]
python cli/zettel.py offer:show|send|accept|reject|pdf <id>
python cli/zettel.py offer:convert <id>              # Rechnungsentwurf; zweiter Aufruf liefert denselben
python cli/zettel.py reminders [--invoice <id>]
python cli/zettel.py reminder:create --invoice <id> --level 1|2|3 [--fee 5,00] [--interest ..] [--pdf]
python cli/zettel.py reminder:send|pdf <id>
python cli/zettel.py stats                           # Umsatz / offene Posten
python cli/zettel.py --version                       # erwartetes DB-Schema
```

### `--json` und Idempotenz

`--json` (vor oder nach dem Befehl) gibt genau ein Objekt auf stdout aus:
`{"ok": true, ...}` bzw. `{"ok": false, "error": "..."}` mit Exit-Code 1. Beträge sind Cent-Integer
(`*Cent`), Daten ISO `YYYY-MM-DD`.

Alle `*:create`-Befehle akzeptieren `--idempotency-key <String>`. Derselbe Schlüssel (pro DB und Typ) legt nichts
neu an und liefert den vorhandenen Datensatz (`"reused": true`). Die Schlüssel stehen in
`<AppData>/cli-idempotency.json` (keine Migration); sie merken sich `created_at` des Datensatzes, ein Schlüssel
aus einer anderen DB-Generation (Restore, „Daten löschen“) wird ignoriert. Stirbt der Prozess zwischen Anlegen und
Schreiben der Datei, kann ein Retry ein Duplikat erzeugen. `offer:convert`, `*:send`, `*:accept`, `*:reject`,
`invoice:issue` und `invoice:paid` sind ohnehin wiederholbar.

### Schema-Schutz

Jeder Befehl außer `status` prüft `PRAGMA user_version` gegen `EXPECTED_SCHEMA` (Test gleicht es mit
`src/lib/utils/schema-version.ts` ab) und bricht bei Abweichung ab, bevor etwas geschrieben wird. Bei jeder
Migration `EXPECTED_SCHEMA` mitziehen, sonst schlägt der Test fehl.

PDFs für Rechnungen, Angebote und Mahnungen brauchen vollständige Firmendaten (wie die App) und landen in
`Rechnungen/`, `Angebote/` bzw. `Mahnungen/` des Dokumente-Roots.

Neue Rechnungen übernehmen wie das App-Formular `default_pdf_language` und die
Skonto-Voreinstellung aus den Settings; `--pdf-language`, `--skonto-percent`/`--skonto-days`
überschreiben sie, `--no-skonto` schaltet Skonto ab. Fremdwährung:
`--currency USD --exchange-rate 1.0832` (1 EUR = X USD, Pflicht außer bei EUR; der
EUR-Gegenwert wird wie in der App eingefroren).

`invoice:xrechnung` schreibt `<Rechnungsnummer>.xml` in denselben Ordner wie das PDF und
prüft vorher dieselben Pflichtangaben wie die App (Leitweg-ID, Verkäufer-Kontakt mit Telefon und
E-Mail, Adressen, IBAN, USt-IdNr. oder Steuernummer, E-Mail des Kunden). Fehlt etwas, bricht der Befehl
mit der Liste der fehlenden Angaben ab, statt eine ungültige Datei zu schreiben. Entwürfe werden
abgelehnt (erst `invoice:issue`). `invoice:create` übernimmt die Leitweg-ID des Kunden als
Käuferreferenz der neuen Rechnung.

Positions-Format: `Beschreibung|Menge|Einheit|Einzelpreis-Euro[|MwSt%][|Langtext]`,
mehrere Positionen mit `;`.

## Konventions-Parität zur App

Der CLI repliziert bewusst die App-Logik aus `src/lib/db/{invoices,offers,reminders,numbering}.ts`:

- **Draft-Placeholder** `DRAFT-<hex>` — kein Nummern-Slot wird verbrannt
- **Lazy Numbering**: echte `RE-{YYYY}-{NNNN}` erst bei `issue`/`pdf`
- **Siegel (GoBD)**: Beim Ausstellen (`invoice:issue`, `invoice:pdf` und `invoice:paid` an einem Entwurf, `invoice:create --issue`) hängt der CLI wie die App ein Siegel an die SHA-256-Hash-Kette `invoice_seals` an (`seal_issued_invoice`); das Format fixiert `sidecar/tests/fixtures/invoice-seal.json`. Das Änderungsprotokoll (`audit_log`) füllen Datenbank-Trigger, es ist also auch für CLI-Änderungen vollständig
- **Positionsbeträge**: exakte Berechnung (`compute_line_total`, Spiegel von `computeLineTotal`; Menge auf höchstens 4 Nachkommastellen gerundet via `round_quantity`, Halbwerte Richtung +∞), pro Position gerundet (`computeTotals`), Cent-Integer überall. Die Regel „gespeicherte Beträge behalten“ (ausgestellte Rechnungen, wieder geöffnete Entwürfe mit Nummer, Stornos dazu, Angebote mit PDF) betrifft nur den App-Editor; die CLI legt neue Rechnungen an und rechnet immer exakt
- **markPaid** protokolliert Restbetrag als `invoice_payments`-Eintrag (`auto`);
  nur bei Status `sent`/`partial` (Entwürfe werden vorher bereitgestellt),
  bei `paid`/`cancelled` bricht `invoice:paid` ohne Änderung mit Fehler ab
- **Fristen** (Fälligkeit, Skonto) zählen Kalendertage in lokaler Zeit (DST-sicher),
  Skonto-Betrag wird kaufmännisch gerundet (half-up); Jahresfilter/-statistik gruppieren nach lokalem Jahr
- **PDF-Versionierung**: existierendes PDF wird vor Regeneration nach
  `Versionen/<stem>__<mtime>.pdf` verschoben (wie `archive_pdf_version`); ein
  bisher in einem anderen Ordner gespeichertes PDF wandert samt Versionen mit
- **PDF-Validierung**: der CLI validiert nicht (KoSIT läuft über die App); ein neu
  erzeugtes PDF setzt `last_validation_*` zurück, statt den Status des alten PDFs stehen zu lassen
- **Parität**: `sidecar/tests/fixtures/invoice-parity.json` (Summen, Nummern, EUR-Gegenwert,
  Zahlungsziel-Text) prüfen Vitest (`src/lib/utils/invoice-parity.test.ts`) und Pytest
  (`sidecar/tests/test_cli_parity.py`) gemeinsam
- **Sidecar**: JSON-RPC über stdin/stdout, Dev-Venv oder `ZETTEL_SIDECAR`-Binary

Bei Änderungen an der App-Logik (Migrationen, Payload-Format) müssen beide
Stellen angefasst werden.
