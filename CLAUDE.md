# Zettel — Claude Code Context

Offline-first invoice generator for German freelancers / Kleinunternehmer. **Tauri 2 + Svelte 5 + Python sidecar.** ZUGFeRD/Factur-X PDF/A-3 und XRechnung. Release-Historie in `CHANGELOG.md` — hier nicht duplizieren. Zahlen (Tests, Schema-Version, Release-Stand) stehen hier bewusst nicht; sie veralten. Schema-Version: `src/lib/utils/schema-version.ts` ist die Quelle, jede Migration hebt sie an.

## Karte
- **Frontend** `src/`: `routes/` (ein Screen pro Route, Teile in Unterordnern wie `routes/time/`, `routes/parts/`), `lib/ui/` (Wrapper über Bits UI), `lib/db/` (SQLite-Queries, Migrationen, Audit/Siegel), Fachlogik in `lib/{tax,reports,export,dashboard,time,mail,xrechnung,bank,utils}`.
- **Rust** `src-tauri/src/`: `lib.rs` (Plugin-Init, Migrations-Registry, Command-Registrierung), `sidecar.rs`, `validator.rs` (KoSIT/Java), `backup.rs` + `crypto.rs`, `tenants.rs` + `sandbox.rs` + `paths.rs`, `mail.rs`, `updates.rs`, `exchange.rs`, `fs_export.rs`.
- **Sidecar** `sidecar/`: `main.py` (JSON-RPC über stdin/stdout), `invoice/` (PDF, ZUGFeRD/XRechnung-XML, Extraktion), `templates/`, `bank/` (CAMT/MT940).
- **CLI** `cli/zettel.py`: headless-DB-Steuerung (Details `cli/README.md`).
- **Docs**: `COMPLIANCE.md`, `PRIVACY.md`, `SECURITY.md`, `docs/` (Verfahrensdokumentation, DATEV, Auto-Update). Ändert sich Verhalten, das dort beschrieben ist, die Doku mitziehen.
- Genauere Orientierung: Code lesen, nicht hier nachschlagen.

## Stack & Commands
| Layer | Tech |
|---|---|
| Frontend | Svelte 5 (runes), TypeScript strict, Vite, Tailwind v4, Bits UI 2 (Node ≥ 22.12), `svelte-spa-router` (hash) |
| Persistenz | `@tauri-apps/plugin-sql` (SQLite); Drizzle nur als Type-Source (`schema.ts`) |
| PDF/XML | WeasyPrint + Jinja2, `factur-x` + `lxml` (Sidecar) |
| E-Rechnung-Validierung | KoSIT-Validator (`validator.jar`, **Java**) auf gebundelter jlink-JRE, von Rust als CLI gespawnt |
| Tests | Vitest (inkl. echte SQLite-DB via `src/lib/db/sqlite-test-db.ts`), Pytest (`sidecar/tests/`), `cargo test` |

`pnpm tauri:dev` (App) · `pnpm dev` (nur Frontend, DB-Calls schlagen fehl) · `pnpm check` · `pnpm test` · `pnpm db:generate` · `pnpm tauri:build` (mit `tauri.bundle.conf.json`-Overlay) · `cd sidecar && pytest`.

## Frontend-Konventionen
- **Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props`). Kein `export let`, keine Legacy-Stores in Components, kein SvelteKit.
- **Alle Form-/Edit-Screens via `push("/...")`** — niemals ein neues Tauri-`WebviewWindow` öffnen (`capabilities/default.json:windows` bleibt `["main"]`).
- UI aus `src/lib/ui/` (shadcn-Stil über Bits UI), Theme-Tokens in `theme.svelte.ts`, Icons aus `$lib/brand-icons` (eigene Bürofreund-Icons, kein Icon-Paket). Wrapper erweitern, nicht umgehen.
- **Deutsche UI-Strings**, englische Identifier/Code/Comments. Kommentare nur, wenn das WARUM nicht offensichtlich ist.
- DB-Naming: snake_case in SQL, camelCase in TS über `mapXxx()`-Helper; Queries sind raw parameterized SQL via `client.ts`.
- Settings ist ein Hub (`/settings` → `/settings/{company,documents,appearance,data,advanced}`, Shell `SettingsShell.svelte`).
- Hover-Konvention: Back-Links mit `ArrowLeft`-Slide, Cards mit Lift-Animation, animierte `ArrowRight` statt „→".

## Money & Numbering
- **Money:** immer Cent (Integer) in der DB, Anzeige via `src/lib/utils/money.ts`. Niemals float.
- **Nummern** (in Settings konfigurierbar): Kunden `K-0001`, Lieferanten `L-0001`, Rechnungen `RE-2026-0001`, Angebote `AN-…`, Ausgaben `EX-…`, Mahnungen `MA-…`.
- **Lazy Invoice Numbering** (nur Rechnungen): Entwürfe tragen `DRAFT-<hex>`; der echte `invoice_number_counter` wird erst in `issueInvoice()` gezogen. `displayInvoiceNumber()` maskiert den Platzhalter als „Entwurf #<4-hex>". Entwürfe löschen → keine Lücken. Angebote/Mahnungen/Ausgaben numerieren eager.
- **Multi-Currency:** `invoice.currency` + `exchange_rate` + eingefrorener `eur_total_cent` (BigInt-Fixed-Point, 8 Dezimalstellen); DATEV nimmt den eingefrorenen Wert. **Storno-Signum:** `eur_total_cent` hat dasselbe Vorzeichen wie `subtotal`/`total`, sonst falsche KPIs.
- **Exakte Positionsbeträge:** `computeLineTotal` (`src/lib/utils/totals.ts`) rechnet Menge × Preis exakt (BigInt, Menge ≤ 4 Nachkommastellen, Halbwerte Richtung +∞), USt je Position gerundet. Mengen werden mit ≤ 4 Nachkommastellen gespeichert. Gespeicherte Beträge (`fixedLineTotal`) bleiben bei Stornorechnungen, ausgestellten/wieder geöffneten Rechnungen und versendeten Angeboten unverändert, bis Menge oder Preis der Position geändert wird. Die CLI spiegelt die Regel; Parität per `sidecar/tests/fixtures/invoice-parity.json` (Vitest und Pytest prüfen dieselbe Datei).
- `markSent(id, sentAt?)` / `markPaid(id, paidAt?)` akzeptieren einen optionalen Unix-Timestamp (Backdating); die UI warnt nur weich.

## Migrationen (vier Sync-Punkte)
Eine neue Migration `000N_<name>.sql` heißt **immer vier Stellen gleichzeitig anfassen**:
1. `PRAGMA user_version = N+1;` am Ende der Migration (Datei `0031_…` setzt 32).
2. `CURRENT_SCHEMA` in `src-tauri/src/backup.rs` — sonst lehnt der Restore frische Backups ab (`Schema neuer als App-Version`).
3. `CURRENT_DB_SCHEMA_VERSION` in `src/lib/utils/schema-version.ts`.
4. Eine Zeile `(version, "beschreibung", "000N_<name>")` im `up_migrations!`-Makro in `build_migrations()` in `lib.rs` — für **beide** DB-Pfade (`sqlite:zettel.db`, `sqlite:zettel-sandbox.db`). Ein Rust-Test prüft lückenlose Versionen, `user_version` je Datei und `CURRENT_SCHEMA`.

**Geshippte Migrationen sind unveränderlich** (Inhalt ändern = neue Migration). `.gitattributes` pinnt LF für `*.sql`, weil `include_str!` byte-stabil über Plattformen sein muss.

## GoBD (Änderungsprotokoll, Siegel)
- `audit_log` und `invoice_seals` sind per Lock-Trigger append-only (Migration 0029); `danger.ts` löscht sie nie. Wer sie über die App ändern kann, hat einen Security-Bug.
- Auditierte Tabellen stehen in `tools/gen_audit_triggers.py`. Die Trigger nennen jede Spalte: **eine neue Spalte an einer auditierten Tabelle braucht neu erzeugte Trigger in einer neuen Migration** (`python tools/gen_audit_triggers.py`; Guard-Test `src/lib/db/audit-log.test.ts` schlägt sonst fehl).
- **Keine Feature-Spalten an versiegelten Rechnungstabellen** — von der Feature-Tabelle auf die Rechnung verlinken (wie `time_entries.invoice_id`).
- Rechnungen mit echter Nummer sind nicht löschbar, nur per Stornorechnung korrigierbar (`invoice-lifecycle.ts`).
- Die CLI berechnet identische Siegel (`cli/zettel.py`, Format fixiert durch `sidecar/tests/fixtures/invoice-seal.json`); `invoice:issue` hängt ein Siegel an.

## Zeiterfassung
Abrechnung legt zuerst den Rechnungsentwurf an und beansprucht die Zeiteinträge dann per **bedingtem UPDATE** (`invoice_id IS NULL`), damit ein Eintrag nicht doppelt abgerechnet wird. Einträge werden nur frei, wenn der Entwurf gelöscht bzw. verworfen wird; ein verworfener Entwurf lässt sich nicht wieder öffnen.

## CLI
Spiegelt App-Logik aus `invoices.ts` (DRAFT-Platzhalter, lazy Numbering, Per-Line-Rundung, Payment-Protokoll, PDF-Versionierung, Siegel, XRechnung-Preflight, Sidecar-RPC). **Bei Logik-Änderungen beide Stellen anfassen.**

## ZUGFeRD / EN-16931 Gotchas
- **BR-CO-26 + Kleinunternehmer:** Fehlt `company.vatId`, emittiert `zugferd-en16931.xml.j2` `<ram:ID>{{ taxNumber }}</ram:ID>` (BT-29) als Fallback **vor** `<ram:Name>` (XSD-Reihenfolge!). Die FC-`SpecifiedTaxRegistration` bleibt zusätzlich (B2B-Portale erwarten sie). Conditional nicht entfernen.
- **Jinja autoescape:** Env nutzt `autoescape=True`, **nicht** `select_autoescape(["html","xml"])` — das prüft nur die letzte Extension, `.xml.j2` matcht nicht, `&`/`<`/`>` in User-Strings würden `xmlParseEntityRef: no name` werfen.
- **Storno-XML** (CII Credit Note): `InvoiceReferencedDocument` gehört in `ApplicableHeaderTradeSettlement` (NICHT `…Agreement`); Beträge durchgängig negativ.
- **Reverse-Charge:** intra-EU = `CategoryCode K` + ExemptionReason „VAT exempt for EEA intra-community supply…"; Drittland = `G` + „Export outside EU". Buyer-USt-IdNr. in `<ram:SpecifiedTaxRegistration schemeID="VA">`.
- **Leistungszeitraum:** Header-Period (BG-14, BT-73/74) gewinnt gegen `delivery_date` (BT-72), wenn beide gesetzt sind; XOR app-seitig erzwungen. Line-Period (BG-26) optional; Einzeltag = `start = end`. Lange Beschreibung in `*_items.long_description` (BT-154) zusätzlich zu `name` (BT-153).
- Profile-URNs und Rendering in `sidecar/invoice/zugferd.py`; Angebot ist PDF/A-3b ohne XML.

## XRechnung
- `render_xrechnung_xml` nutzt **dasselbe** Template `zugferd-en16931.xml.j2` mit `xrechnung`-Schalter; Ausgabe ist eine eigenständige `.xml` neben dem PDF (`generate_xrechnung`).
- Unterschiede zum Factur-X-XML: `BusinessProcess`-ID (BT-23) vor der Guideline; `DefinedTradeContact` (BR-DE-2/5/6/7) **zwischen** `Name` und `PostalTradeAddress`; `URIUniversalCommunication` (BT-34/BT-49) **nach** der Adresse; `ShipToTradeParty` nur bei Reverse Charge intra-EU (BR-IC-12, mit voller Adresse, BR-DE-10/11); Skonto als `#SKONTO#TAGE=n#PROZENT=n.nn#`-Zeile mit abschließendem Zeilenumbruch in `Description` statt `ApplicableTradePaymentDiscountTerms` (BR-DE-18); Stornozeilen mit negativer Menge (PEPPOL-R120).
- Pflichtangaben prüft vorab `src/lib/xrechnung/preflight.ts` (CLI-Spiegel `missing_xrechnung_fields`, geteilte Cases in `invoice-parity.json`). Käuferreferenz (BT-10, Leitweg-ID) wird beim Anlegen vom Kunden kopiert (`resolveBuyerReference`), Stornos erben die der Originalrechnung.

## Build, CI, Release
- **CI** (`ci.yml`): Frontend check/test/build, Sidecar pytest, Rust fmt/clippy `-D warnings`/test, Sammel-Check „CI ok". `build.yml`: Installer + Release. `update-feed.yml`: Beta-Feed.
- **Runner-Matrix** `build.yml`: windows-latest / macos-15 (arm64) / ubuntu-22.04; macOS Intel ist deaktiviert (Queue-Zeiten). GitHub zieht Runner-Images zurück: scheitert ein Tag-Build mit „configuration … not supported", das Image anheben.
- **Resources-Split:** Production-Resources (`sidecar/dist`, `tools/jre`, `kosit-validator`) leben in `tauri.bundle.conf.json`, **nicht** in `tauri.conf.json` — sonst emittiert `cargo:rerun-if-changed` tausende Files und der Dev-Build crasht auf Windows mit `Zugriff verweigert (os error 5)`.
- **Updater:** Ed25519-signiert, statisches `latest.json` bei GitHub Releases. Tauri-2-Quirk: NSIS-Setup-Signatur ist `-setup.exe.sig`; `bundle.createUpdaterArtifacts: true` muss gesetzt sein. Check läuft über den Rust-Command `updates::check_for_update(channel)` (JS-`check()` kann keine Endpoints wechseln): `stable` = `releases/latest` (nie Pre-Releases), `beta` = Rolling-Release `beta-feed`. Kanalwahl in `localStorage` (`zettel.update_channel`).
- **Versionen:** nur via `pnpm version:set <semver>` (package.json, tauri.conf.json, Cargo.toml, Cargo.lock; CI prüft Gleichheit). RC = Tag `vX.Y.Z-rc.N` auf einem Commit in `release/vX.Y` → Draft-Pre-Release (Windows nur NSIS, MSI kann keine `-rc`).
- **Publish-Gate:** Ein Tag baut nur einen **Draft**. Assets und `latest.json` prüfen, dann veröffentlichen (`gh release edit <tag> --draft=false`; RC: `--draft=false --prerelease --latest=false`) — erst das löst `update-feed.yml` aus und erreicht Clients. Checkliste: `docs/auto-update-setup.md`.
- **Linux/macOS:** WeasyPrint lädt Pango/Cairo dynamisch (`libpango1.0-0 libcairo2 libgdk-pixbuf2.0-0` bzw. `brew install pango cairo gdk-pixbuf`).

## Sidecar (dev)
```bash
cd sidecar
python -m venv .venv
.venv/Scripts/activate     # Win — bash: source .venv/bin/activate
pip install -r requirements.txt
pytest                     # einige Tests brauchen den lokalen KoSIT-Validator (tools/download-validator.sh)
python build.py            # PyInstaller-Bundle nach sidecar/dist/
```
Dev-Python-Lookup: `ZETTEL_PYTHON` → `sidecar/.venv` → `python` im PATH. **GTK3-Runtime (Windows):** `_add_gtk_dll_path` in `main.py` sucht frozen → exe-dir → `C:\Program Files\GTK3-Runtime Win64\` → msys64; Override `ZETTEL_GTK_PATH`. Der Windows-Build kopiert **jede** `.dll` aus dem GTK-Dir neben die exe (keine Allowlist, die GTK-Varianten shippen verschiedene Lib-Versionen).

## AppData & Pfade
- **App-Daten** (DB, `sandbox.flag`, `tenants.json`, `pending_restore/`): Windows `%APPDATA%\digital.laux.zettel\`, macOS `~/Library/Application Support/digital.laux.zettel/`, Linux `~/.local/share/digital.laux.zettel/` — die eingebauten DBs liegen unter Linux in `~/.config/digital.laux.zettel/`.
- **PDFs + Backups** unter dem Dokumente-Root: `<Dokumente>/Zettel` (Standard), `<Dokumente>/Zettel-Sandbox`, `<Dokumente>/Zettel/Mandanten/<tenant-id>`; Unterordner `{Rechnungen,Angebote,Mahnungen,Eingangsrechnungen/<vendor>,Backups}`. `<Dokumente>` ist der Windows-Known-Folder (folgt OneDrive). Einzige Quelle: `tenants::active_documents_root` (Command `get_documents_root`); die CLI spiegelt es.
- `backup.rs`: staged Restore nach `pending_restore/`, läuft **vor** dem SQL-Plugin-Init (`apply_pending_restore_blocking()`); App-Identifier ist hardcoded `digital.laux.zettel`.

## Git workflow
- Feature-Arbeit auf `release/vX.Y`-Branches via PR (Squash-Merge); `main` = letztes shipped Release; konsolidierender PR `release/vX.Y → main` beim Release. Conventional Commits.
- **Alle `git`/`pnpm`/`gh`/`cargo`/`tauri`-Commands via PowerShell.** WSL-bash ist OK für Read/Edit/Write und read-only `git`/`grep`, aber nicht für `pnpm install` (Linux-native rollup-Binaries im `node_modules` brechen den Windows-Build).

## Don't
- Keine Backend-HTTP-Server — alles ist Tauri-Commands oder direkt SQLite. Keine Telemetrie.
- Kein React, kein SvelteKit, kein styled-components.
- Money niemals als float.
- Kein Tesseract (Scan-OCR ist Non-Goal). Kein ELSTER-Upload (würde den GoBD-Disclaimer aufweichen).
- Kein SMTP; Versand nur per Übergabe an das Mail-Programm (`mail.rs`).
- Inhalt einer geshippten Migration niemals nachträglich ändern.
- Niemals ein neues `WebviewWindow` für Formulare öffnen.

## Further reading
`CHANGELOG.md` · `docs/datev-export.md` · `docs/auto-update-setup.md` · `docs/verfahrensdokumentation.md` · `CONTRIBUTING.md`
