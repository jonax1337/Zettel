# Security Policy

Zettel verarbeitet sensible Geschäfts- und Steuerdaten lokal auf deinem Rechner. Wir nehmen Security-Reports ernst und bitten dich, verantwortungsvoll offenzulegen.

## Unterstützte Versionen

Sicherheits-Fixes erhält ausschließlich die **neueste Release-Version** auf `main`. Ältere Versionen werden nicht rückportiert. Updates kommen via Auto-Updater (Ed25519-signiert) — auf der aktuellen Version zu bleiben ist Teil der Sicherheitsstrategie.

| Version | Sicherheits-Fixes |
|---|---|
| 0.13.x (latest) | ✅ |
| < 0.13 | ❌ — bitte updaten |

## Schwachstelle melden

**Bitte keine öffentlichen GitHub Issues für Security-Bugs.** Stattdessen einen der folgenden Wege nutzen:

1. **GitHub Security Advisory (bevorzugt):**
   <https://github.com/jonax1337/zettel/security/advisories/new>
2. **E-Mail:** `security@laux.digital` — PGP optional, Inhalt darf Klartext sein.

Bitte enthalten:
- Betroffene Version (`Über Zettel` → Version + Commit)
- Reproduktions-Schritte oder Proof-of-Concept
- Geschätzte Auswirkung (Datenzugriff, Code-Execution, Bypass)
- Plattform (Windows/macOS/Linux) und ggf. Konfiguration

**Antwort-Zeiten (Best Effort, Indie-Projekt):**
- Erste Bestätigung: innerhalb **3 Werktage**
- Erstbewertung: innerhalb **10 Werktage**
- Fix oder Coordinated-Disclosure-Plan: innerhalb **90 Tage**, je nach Schwere früher

## In Scope

- Backup-Verschlüsselung (AES-256-GCM + Argon2id, `src-tauri/src/crypto.rs`)
- Sidecar-IPC (JSON über stdin/stdout, `src-tauri/src/sidecar.rs`)
- SQL-Injection im Query-Layer (`src/lib/db/`)
- Tauri-Capabilities und Datei-System-Zugriff (`src-tauri/capabilities/`)
- Updater-Signaturprüfung (Ed25519)
- XML-Parsing eingehender ZUGFeRD-PDFs (XXE, Billion-Laughs in `sidecar/invoice/extract.py`)
- PDF/HTML-Rendering (XSS in user-controlled fields, Jinja-Escaping)
- Restore-Pfad (`src-tauri/src/backup.rs`, insbesondere staged `pending_restore/`)

## Out of Scope

- Angriffe, die voraussetzen, dass der Angreifer bereits **Schreibrechte auf das User-AppData-Verzeichnis** hat — wer das hat, hat ohnehin alles
- Social-Engineering gegen den User (z.B. „User installiert manipulierte Sidecar-Binary")
- Denial-of-Service durch absichtlich riesige Eingangs-PDFs (das ist ein Bug, kein CVE)
- Fehlende Sicherheitsheader in `dev`-Mode (`pnpm tauri:dev`)
- Vulnerabilities in End-of-Life-Versionen (< 0.13)
- Kosmetische Probleme ohne Sicherheits-Relevanz

## Disclosure

Wir folgen **Coordinated Disclosure**. Reporter werden — sofern gewünscht — in den Release-Notes und im GitHub Security Advisory namentlich erwähnt. Es gibt aktuell kein Bug-Bounty-Programm (Indie-Projekt, kein Budget) — herzlicher Dank und Credits sind alles, was wir bieten können.

## Sicherheits-relevante Architektur-Entscheidungen

- **Keine Telemetrie, kein Server.** Zettel sendet keine Daten nach außen. Einzige ausgehende Verbindungen: ECB-Wechselkurs-Feed (`exchange.rs`, opt-in bei Multi-Currency) und GitHub-Updater-Endpoint.
- **Keine eingebetteten Credentials.** Backup-Passwörter werden nicht gespeichert.
- **Migration-Inhalte sind nach Shipping unveränderlich** (siehe [`CLAUDE.md`](./CLAUDE.md#migrations-sind-3-punkt-synchron)) — verhindert stille Schema-Manipulation.
- **`capabilities/default.json:windows` ist auf `["main"]` beschränkt** — kein Pop-up-Webview kann frei navigieren.

Generelle Architektur-Übersicht: [`CLAUDE.md`](./CLAUDE.md). DSGVO/Datenschutz: [`PRIVACY.md`](./PRIVACY.md). Compliance-Hinweise: [`COMPLIANCE.md`](./COMPLIANCE.md).
