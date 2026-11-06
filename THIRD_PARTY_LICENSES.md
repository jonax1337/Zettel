# Third-Party Licenses

Zettel selbst steht unter der [MIT-Lizenz](./LICENSE). Diese Datei führt die direkten Abhängigkeiten und ihre Lizenzen auf. Eine vollständige, transitive Liste (inkl. Sub-Dependencies) kann jederzeit mit `pnpm licenses list`, `cargo about` bzw. `pip-licenses` erzeugt werden.

Die Versionen sind die aufgelösten Versionen aus `pnpm-lock.yaml`, `Cargo.lock` bzw. `sidecar/requirements.txt`; die Lizenzangaben stammen aus den Paket-Metadaten (`package.json` der installierten npm-Pakete, `cargo metadata`, Python-Paket-Metadaten samt Lizenzdatei). Wo das nicht geprüft werden konnte, steht es dabei. Stand: v0.24-Entwicklungszweig.

Sollte eine Lizenz hier fehlerhaft oder veraltet sein: bitte ein Issue öffnen oder direkt eine PR — wir korrigieren das umgehend.

## Frontend (npm / pnpm)

### Laufzeit (im App-Bundle)

| Paket | Version | Lizenz | Verwendung |
|---|---|---|---|
| `bits-ui` | 2.19.3 | MIT | Headless-UI-Primitives |
| `svelte-spa-router` | 5.1.1 | MIT | Hash-Routing |
| `@internationalized/date` | 3.12.4 | Apache-2.0 | Datums-Logik |
| `clsx` | 2.1.1 | MIT | Class-Concat |
| `tailwind-merge` | 3.7.0 | MIT | Tailwind-Class-Merge |
| `tailwind-variants` | 3.3.1 | MIT | Variant-API |
| `drizzle-orm` | 0.45.3 | Apache-2.0 | Schema-Typen (nur compile-time) |
| `@tauri-apps/api` | 2.12.0 | Apache-2.0 OR MIT | Tauri-Bridge |
| `@tauri-apps/plugin-dialog` | 2.8.0 | MIT OR Apache-2.0 | Datei-Dialoge |
| `@tauri-apps/plugin-opener` | 2.7.0 | MIT OR Apache-2.0 | Dateien, Ordner und Links öffnen |
| `@tauri-apps/plugin-process` | 2.4.0 | MIT OR Apache-2.0 | Neustart |
| `@tauri-apps/plugin-sql` | 2.5.0 | MIT OR Apache-2.0 | SQLite-Zugriff |
| `@tauri-apps/plugin-updater` | 2.13.1 | MIT OR Apache-2.0 | Auto-Update |

`svelte` (MIT) steht als `devDependency` unten bei den Build-Tools; sein Laufzeitcode steckt ebenfalls im Bundle.

### Build und Entwicklung

| Paket | Version | Lizenz | Verwendung |
|---|---|---|---|
| `svelte` | 5.57.1 | MIT | UI-Framework (Compiler + Laufzeit) |
| `@sveltejs/vite-plugin-svelte` | 7.3.1 | MIT | Build-Plugin |
| `vite` | 8.3.1 | MIT | Dev-Server / Bundler |
| `tailwindcss` | 4.3.3 | MIT | Styling |
| `@tailwindcss/vite` | 4.3.3 | MIT | Tailwind-Integration |
| `typescript` | 6.0.3 | Apache-2.0 | Compiler |
| `svelte-check` | 4.7.6 | MIT | Type-Check |
| `vitest` | 5.0.2 | MIT | Unit-Tests |
| `@vitest/ui` | 5.0.2 | MIT | Test-Oberfläche |
| `drizzle-kit` | 0.31.11 | MIT | Schema-Generator |
| `@tauri-apps/cli` | 2.12.0 | Apache-2.0 OR MIT | Build-Tool |

## Rust (`src-tauri/Cargo.toml`)

| Crate | Version | Lizenz | Verwendung |
|---|---|---|---|
| `tauri` | 2.12.1 | Apache-2.0 OR MIT | Application-Framework |
| `tauri-build` (build) | 2.7.1 | Apache-2.0 OR MIT | Build-Skript |
| `tauri-plugin-sql` | 2.5.0 | Apache-2.0 OR MIT | SQL-Plugin (Migrationen, DB-Zugriff aus dem Frontend) |
| `tauri-plugin-dialog` | 2.8.1 | Apache-2.0 OR MIT | Datei-Dialoge |
| `tauri-plugin-opener` | 2.7.0 | Apache-2.0 OR MIT | Dateien, Ordner und Links öffnen |
| `tauri-plugin-process` | 2.4.0 | Apache-2.0 OR MIT | Neustart |
| `tauri-plugin-updater` | 2.13.1 | Apache-2.0 OR MIT | Auto-Update |
| `tauri-plugin-window-state` | 2.5.0 | Apache-2.0 OR MIT | Fenstergröße und -position merken |
| `serde` / `serde_json` | 1.0.229 / 1.0.151 | MIT OR Apache-2.0 | JSON-Serialisierung (Sidecar-IPC, Konfiguration) |
| `ureq` | 3.4.2 | MIT OR Apache-2.0 | Synchroner HTTP-Client (ECB-Wechselkurs) |
| `rusqlite` | 0.32.1 | MIT | SQLite-Bindung (Backup, Restore; Feature `bundled`) |
| `aes-gcm` | 0.10.3 | Apache-2.0 OR MIT | Backup-Verschlüsselung |
| `argon2` | 0.5.3 | MIT OR Apache-2.0 | Key-Derivation für Backups |
| `rand` | 0.10.3 | MIT OR Apache-2.0 | Zufall (u. a. Salt, Nonce) |
| `zeroize` | 1.9.0 | Apache-2.0 OR MIT | Schlüsselmaterial aus dem Speicher löschen |
| `zip` | 8.6.0 | MIT | Backup-Archiv |
| `walkdir` | 2.5.0 | Unlicense/MIT | Verzeichnisse durchlaufen (Backup) |
| `dirs` | 7.0.0 | MIT OR Apache-2.0 | Dokumente-Ordner ermitteln |

Vollständige Auflistung inkl. transitiver Crates: `cargo tree --manifest-path src-tauri/Cargo.toml` bzw. `cargo about generate`.

## Python-Sidecar (`sidecar/requirements.txt`)

| Paket | Version | Lizenz | Verwendung |
|---|---|---|---|
| `weasyprint` | 70.0 | BSD-3-Clause | HTML → PDF/A-3-Rendering |
| `Jinja2` | 3.1.6 | BSD-3-Clause | Template-Engine |
| `factur-x` | 7.1 | BSD-3-Clause | ZUGFeRD/Factur-X-XML-Embedding und -Extraction |
| `lxml` | 6.1.3 | BSD-3-Clause (libxml2/libxslt: MIT) | XML-Verarbeitung |
| `pypdf` | 6.19.0 | BSD-3-Clause | Text-Extraktion aus Eingangsrechnungen |
| `segno` | 1.6.6 | BSD-3-Clause | EPC-QR-Code (Girocode) |
| `mt-940` | 5.1.1 | BSD-3-Clause | MT940-Kontoauszüge einlesen |
| `tzdata` | 2025.2 | Apache-2.0 | Zeitzonen-Daten (Europe/Berlin) |
| `pyinstaller` (nur Build, CI-Pin) | 6.22.3 | GPL-2.0-or-later mit Bootloader-Exception ([Details](https://pyinstaller.org/en/stable/license.html)) | Sidecar-Bundling |

Die Lizenzen von WeasyPrint, Jinja2, factur-x und segno wurden anhand der mitgelieferten Lizenzdatei (BSD-3-Clause-Text) geprüft, die übrigen anhand der Paket-Metadaten. Die Angabe „libxml2/libxslt: MIT" für `lxml` wurde nicht erneut geprüft.

**Hinweis zu PyInstaller:** Der mit PyInstaller erzeugte Binary fällt **nicht** unter die GPL, weil die Bootloader-Ausnahme das ausdrücklich erlaubt. Die generierte ausführbare Datei kann unter beliebiger Lizenz weitergegeben werden.

## Native Runtime-Abhängigkeiten

Diese Libraries werden zur **Laufzeit** dynamisch geladen, sind nicht statisch gebundelt:

| Library | Lizenz | Bezugsweg |
|---|---|---|
| **GTK 3** (Pango, Cairo, GDK-Pixbuf, GLib) | LGPL-2.1+ | Windows: GTK-for-Windows-Runtime-Installer; macOS: `brew install pango cairo gdk-pixbuf`; Linux: `apt install libpango1.0-0 libcairo2 libgdk-pixbuf2.0-0` |
| **System-WebView** | OS-spezifisch | WebView2 (Windows), WKWebView (macOS), WebKitGTK (Linux) |

*(Lizenzangabe zu GTK aus der bisherigen Fassung übernommen, nicht neu geprüft.)*

WeasyPrint nutzt diese Libraries über die Python-Bindings `cffi` / `pycairo` / `pangocairo`. Die GTK-Lizenz (LGPL) bleibt unverletzt, weil die Bibliotheken **dynamisch** gelinkt werden — Nutzer können sie ohne unsere Mitwirkung gegen kompatible Versionen austauschen.

**Windows-Build:** Der Sidecar-Build-Prozess (`sidecar/build.py`) kopiert die `.dll`s aus dem GTK3-Runtime-Verzeichnis neben die PyInstaller-Exe. Diese Kopie ist eine reine Distribution unveränderter LGPL-Binaries — die Original-Lizenzen liegen unter `C:\Program Files\GTK3-Runtime Win64\share\doc\` bzw. werden ungeändert mit dem Installer ausgeliefert.

## Gebündelte Tools (Release-Build)

| Tool | Version | Lizenz | Verwendung |
|---|---|---|---|
| [**KoSIT-Validator**](https://github.com/itplr-kosit/validator) (`validator.jar`, standalone) | 1.6.2 (`tools/download-validator.sh`) | Apache-2.0 (Lizenztext `LICENSE.validator` im Jar) | Validierung der erzeugten E-Rechnungs-XML |
| [**XRechnung-Prüfkonfiguration**](https://github.com/itplr-kosit/validator-configuration-xrechnung) (Scenarios, Schematron, XSD) | Konfiguration 2026-01-31, XRechnung 3.0.2 | nicht lokal geprüft — siehe Lizenzangabe im Upstream-Repository | Prüfregeln für KoSIT |
| **Java-Runtime** (per `jlink` minimiert, `tools/build-jre.sh`) | Java 17 (CI: `actions/setup-java`, Distribution Temurin) | GPL-2.0 mit Classpath-Exception (Lizenztexte in `jre/legal/`) | Laufzeit für den KoSIT-Validator, unter `jre/` mit Release-Builds gebündelt |

Die gebündelte JRE wird unverändert verteilt; die Classpath-Exception erlaubt das Bundling mit Software unter beliebiger Lizenz.

## Fonts

- **Nunito & Nunito Sans** — SIL Open Font License 1.1. Variable Schriftdateien liegen in der App unter `src/assets/fonts/` (lokal gebundelt, keine externe Anfrage zur Laufzeit) und für das Bürofreund-Design-Kit unter `branding/buerofreund/fonts/`; die vollständigen Lizenzen liegen dort als [Nunito-OFL.txt](src/assets/fonts/Nunito-OFL.txt) und [NunitoSans-OFL.txt](src/assets/fonts/NunitoSans-OFL.txt) (Kopien im Design Kit: [Nunito-OFL.txt](branding/buerofreund/fonts/Nunito-OFL.txt), [NunitoSans-OFL.txt](branding/buerofreund/fonts/NunitoSans-OFL.txt)).

## Icons

Die Icons der App sind eigene Zeichnungen im Bürofreund-Stil (`src/lib/brand-icons/`). Ein Icon-Paket eines Dritten (früher `@lucide/svelte`) wird nicht mehr verwendet.

## Externe Online-Dienste (optional, on-demand)

- **EZB Euro foreign exchange reference rates** — <https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml>, frei nutzbar laut [EZB-Disclaimer](https://www.ecb.europa.eu/services/disclaimer/html/index.en.html)
- **GitHub Releases** — für Auto-Update; unterliegt den [GitHub Terms](https://docs.github.com/en/site-policy)

## Komplette Inventarisierung

Für einen SBOM (Software Bill of Materials) im SPDX-/CycloneDX-Format können `cargo cyclonedx`, `cyclonedx-bom` (npm) und `cyclonedx-py` genutzt werden — wir generieren das aktuell nicht automatisch, planen es aber für ein zukünftiges Release.
