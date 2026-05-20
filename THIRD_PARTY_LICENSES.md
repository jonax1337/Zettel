# Third-Party Licenses

Zettel selbst steht unter der [MIT-Lizenz](./LICENSE). Diese Datei führt die direkten Abhängigkeiten und ihre Lizenzen auf. Eine vollständige, transitive Liste (inkl. Sub-Dependencies) kann jederzeit mit `pnpm licenses list`, `cargo about` bzw. `pip-licenses` erzeugt werden.

Sollte eine Lizenz hier fehlerhaft oder veraltet sein: bitte ein Issue öffnen oder direkt eine PR — wir korrigieren das umgehend.

## Frontend (npm / pnpm)

| Paket | Version | Lizenz | Verwendung |
|---|---|---|---|
| `svelte` | ^5.16 | MIT | UI-Framework |
| `@sveltejs/vite-plugin-svelte` | ^5.0 | MIT | Build-Plugin |
| `svelte-spa-router` | ^5.1 | MIT | Hash-Routing |
| `svelte-check` | ^4.1 | MIT | Type-Check |
| `vite` | ^6.0 | MIT | Dev-Server / Bundler |
| `vitest` | ^2.1 | MIT | Unit-Tests |
| `typescript` | ^5.7 | Apache-2.0 | Compiler |
| `tailwindcss` | ^4.0 | MIT | Styling |
| `@tailwindcss/vite` | ^4.0 | MIT | Tailwind-Integration |
| `bits-ui` | ^1.3 | MIT | Headless-UI-Primitives |
| `@lucide/svelte` | ^1.16 | ISC | Icon-Set |
| `@internationalized/date` | ^3.12 | Apache-2.0 | Datums-Logik |
| `@fontsource-variable/geist` | ^5.2 | OFL-1.1 | Schriftart (lokal gebundelt) |
| `@fontsource-variable/geist-mono` | ^5.2 | OFL-1.1 | Schriftart (lokal gebundelt) |
| `clsx` | ^2.1 | MIT | Class-Concat |
| `tailwind-merge` | ^2.5 | MIT | Tailwind-Class-Merge |
| `tailwind-variants` | ^0.3 | MIT | Variant-API |
| `drizzle-orm` | ^0.36 | Apache-2.0 | Schema-Typen (nur compile-time) |
| `drizzle-kit` | ^0.28 | MIT | Schema-Generator |
| `@tauri-apps/api` | ^2.1 | Apache-2.0 OR MIT | Tauri-Bridge |
| `@tauri-apps/cli` | ^2.1 | Apache-2.0 OR MIT | Build-Tool |
| `@tauri-apps/plugin-*` | ^2.x | Apache-2.0 OR MIT | dialog / opener / process / shell / sql / updater / window-state |

## Rust (`src-tauri/Cargo.toml`)

| Crate | Lizenz | Verwendung |
|---|---|---|
| `tauri` | Apache-2.0 OR MIT | Application-Framework |
| `tauri-plugin-*` | Apache-2.0 OR MIT | sql / updater / dialog / opener / process / shell / window-state |
| `serde` / `serde_json` | Apache-2.0 OR MIT | JSON-Serialisierung (Sidecar-IPC) |
| `tokio` | MIT | Async-Runtime |
| `ureq` | Apache-2.0 OR MIT | Synchroner HTTP-Client (ECB-Wechselkurs, Updater) |
| `aes-gcm` | Apache-2.0 OR MIT | Backup-Verschlüsselung |
| `argon2` | Apache-2.0 OR MIT | Key-Derivation für Backups |
| `zip` | MIT | Backup-Archiv |
| `rusqlite` (über `tauri-plugin-sql`) | MIT | SQLite-Bindung |
| `chrono` | Apache-2.0 OR MIT | Datums-/Zeit-Helfer |

Vollständige Auflistung inkl. transitiver Crates: `cargo tree --manifest-path src-tauri/Cargo.toml` bzw. `cargo about generate`.

## Python-Sidecar (`sidecar/requirements.txt`)

| Paket | Version | Lizenz | Verwendung |
|---|---|---|---|
| `weasyprint` | 65.1 | **BSD-3-Clause** | HTML → PDF/A-3-Rendering |
| `Jinja2` | 3.1.4 | BSD-3-Clause | Template-Engine |
| `factur-x` | 3.4 | **BSD-3-Clause** | ZUGFeRD/Factur-X-XML-Embedding und -Extraction |
| `lxml` | 5.3.0 | BSD-3-Clause (libxml2/libxslt: MIT) | XML-Verarbeitung |
| `pypdf` | 5.1.0 | BSD-3-Clause | OCR-Light-Text-Extraktion aus Eingangsrechnungen |
| `pyinstaller` (build only) | 6.11.1 | GPL-2.0-or-later mit Bootloader-Exception ([Details](https://pyinstaller.org/en/stable/license.html)) | Sidecar-Bundling |

**Hinweis zu PyInstaller:** Der mit PyInstaller erzeugte Binary fällt **nicht** unter die GPL, weil die Bootloader-Ausnahme das ausdrücklich erlaubt. Die generierte ausführbare Datei kann unter beliebiger Lizenz weitergegeben werden.

## Native Runtime-Abhängigkeiten

Diese Libraries werden zur **Laufzeit** dynamisch geladen, sind nicht statisch gebundelt:

| Library | Lizenz | Bezugsweg |
|---|---|---|
| **GTK 3** (Pango, Cairo, GDK-Pixbuf, GLib) | LGPL-2.1+ | Windows: GTK-for-Windows-Runtime-Installer; macOS: `brew install pango cairo gdk-pixbuf`; Linux: `apt install libpango1.0-0 libcairo2 libgdk-pixbuf2.0-0` |
| **System-WebView** | OS-spezifisch | WebView2 (Windows), WKWebView (macOS), WebKitGTK (Linux) |

WeasyPrint nutzt diese Libraries über die Python-Bindings `cffi` / `pycairo` / `pangocairo`. Die GTK-Lizenz (LGPL) bleibt unverletzt, weil die Bibliotheken **dynamisch** gelinkt werden — Nutzer können sie ohne unsere Mitwirkung gegen kompatible Versionen austauschen.

**Windows-Build:** Der Sidecar-Build-Prozess (`sidecar/build.py`) kopiert die `.dll`s aus dem GTK3-Runtime-Verzeichnis neben die PyInstaller-Exe. Diese Kopie ist eine reine Distribution unveränderter LGPL-Binaries — die Original-Lizenzen liegen unter `C:\Program Files\GTK3-Runtime Win64\share\doc\` bzw. werden ungeändert mit dem Installer ausgeliefert.

## Tools

| Tool | Lizenz | Verwendung |
|---|---|---|
| [**KoSIT-Validator**](https://github.com/itplr-kosit/validator) | Apache-2.0 | Validierung der erzeugten ZUGFeRD-XML im Release-Build (Java-JRE + Schematron-Regeln) |
| **AdoptOpenJDK / Eclipse Temurin** (JRE für KoSIT) | GPL-2.0-with-Classpath-Exception | JRE wird unter `tools/jre/` mit Release-Builds gebundelt |

Die mit Tauri gebundelte JRE wird unverändert verteilt; die Classpath-Exception erlaubt das Bundling mit Software unter beliebiger Lizenz.

## Fonts

- **Geist & Geist Mono** — SIL Open Font License 1.1, © Vercel. Lokal als `@fontsource-variable`-Paket gebundelt, keine externe Anfrage zur Laufzeit.

## Externe Online-Dienste (optional, on-demand)

- **EZB Euro foreign exchange reference rates** — <https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml>, frei nutzbar laut [EZB-Disclaimer](https://www.ecb.europa.eu/services/disclaimer/html/index.en.html)
- **GitHub Releases** — für Auto-Update; unterliegt den [GitHub Terms](https://docs.github.com/en/site-policy)

## Komplette Inventarisierung

Für einen SBOM (Software Bill of Materials) im SPDX-/CycloneDX-Format können `cargo cyclonedx`, `cyclonedx-bom` (npm) und `cyclonedx-py` genutzt werden — wir generieren das aktuell nicht automatisch, planen es aber für ein zukünftiges Release.
