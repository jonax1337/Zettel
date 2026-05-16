//! Backup / Restore — bundles SQLite + generated PDFs into a single ZIP that
//! the user can stash anywhere (cloud drive, USB stick, ...) and import again
//! on a fresh installation.
//!
//! Flow:
//!   • **Create** — frontend has SQLite emit a consistent snapshot via
//!     `VACUUM INTO`; this command zips the snapshot together with PDFs from
//!     `~/Documents/Zettel/Rechnungen/` plus a `manifest.json` and deletes
//!     the snapshot afterwards.
//!   • **Stage restore** — extract the ZIP into a pending directory and write
//!     a marker file. The DB is locked while the app runs, so applying
//!     happens on next startup.
//!   • **Apply pending** — called once during `run()` BEFORE the SQL plugin
//!     initializes; if the marker file exists it moves staged files into
//!     place and removes the pending dir.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

/// App identifier — must match `tauri.conf.json:identifier`. Hardcoded so the
/// pre-builder restore step works without an AppHandle.
const APP_IDENTIFIER: &str = "digital.laux.zettel";

const MANIFEST_NAME: &str = "manifest.json";
const DB_ENTRY: &str = "zettel.db";
const PDF_DIR_ENTRY: &str = "Rechnungen";
const PENDING_DIR: &str = "pending_restore";
const PENDING_MARKER: &str = "RESTORE_PENDING";

#[derive(Debug, Serialize, Deserialize)]
struct BackupManifest {
    app_version: String,
    created_at: String,
    db_schema_version: u32,
    invoice_count: Option<u32>,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn documents_zettel_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let doc = app.path().document_dir().map_err(|e| e.to_string())?;
    Ok(doc.join("Zettel"))
}

/// Resolve the app-data dir without an AppHandle, for use during early
/// startup (before the Tauri builder has a chance to initialize plugins).
fn app_data_dir_static() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join(APP_IDENTIFIER))
}

fn documents_zettel_dir_static() -> Option<PathBuf> {
    dirs::document_dir().map(|d| d.join("Zettel"))
}

#[tauri::command]
pub async fn snapshot_db_path(app: AppHandle) -> Result<String, String> {
    // The frontend issues `VACUUM INTO ?` against the live SQLite connection
    // to produce a consistent snapshot at this path.
    let p = app_data_dir(&app)?.join("zettel.backup.tmp.db");
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if p.exists() {
        let _ = fs::remove_file(&p);
    }
    Ok(p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn bundle_backup(
    app: AppHandle,
    snapshot_path: String,
    target_zip: String,
    invoice_count: Option<u32>,
    db_schema_version: u32,
) -> Result<String, String> {
    let snapshot = PathBuf::from(&snapshot_path);
    if !snapshot.is_file() {
        return Err(format!("snapshot missing: {}", snapshot_path));
    }
    let target = PathBuf::from(&target_zip);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let zip_file = File::create(&target).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(zip_file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // 1) manifest
    let manifest = BackupManifest {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: chrono_like_now(),
        db_schema_version,
        invoice_count,
    };
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    zip.start_file(MANIFEST_NAME, opts).map_err(|e| e.to_string())?;
    zip.write_all(manifest_json.as_bytes()).map_err(|e| e.to_string())?;

    // 2) DB
    zip.start_file(DB_ENTRY, opts).map_err(|e| e.to_string())?;
    let mut db_bytes = Vec::new();
    File::open(&snapshot)
        .map_err(|e| e.to_string())?
        .read_to_end(&mut db_bytes)
        .map_err(|e| e.to_string())?;
    zip.write_all(&db_bytes).map_err(|e| e.to_string())?;

    // 3) PDFs (optional — directory may not exist)
    let pdf_root = documents_zettel_dir(&app)?.join("Rechnungen");
    if pdf_root.is_dir() {
        for entry in WalkDir::new(&pdf_root).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if !p.is_file() {
                continue;
            }
            let rel = match p.strip_prefix(&pdf_root) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let entry_name = format!("{}/{}", PDF_DIR_ENTRY, rel.to_string_lossy().replace('\\', "/"));
            zip.start_file(entry_name, opts).map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            File::open(p)
                .map_err(|e| e.to_string())?
                .read_to_end(&mut buf)
                .map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&snapshot);
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn stage_restore(app: AppHandle, source_zip: String) -> Result<String, String> {
    let src = PathBuf::from(&source_zip);
    if !src.is_file() {
        return Err(format!("ZIP missing: {}", source_zip));
    }

    let pending_root = app_data_dir(&app)?.join(PENDING_DIR);
    if pending_root.exists() {
        fs::remove_dir_all(&pending_root).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&pending_root).map_err(|e| e.to_string())?;

    let file = File::open(&src).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut found_db = false;
    let mut manifest_ok = false;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name == MANIFEST_NAME {
            let mut content = String::new();
            entry.read_to_string(&mut content).map_err(|e| e.to_string())?;
            let parsed: BackupManifest =
                serde_json::from_str(&content).map_err(|e| format!("invalid manifest: {}", e))?;
            // Schemata neuer als die App selbst => Restore ablehnen.
            // (4 = aktueller Schema-Stand zur Zeit dieses PRs.)
            const CURRENT_SCHEMA: u32 = 4;
            if parsed.db_schema_version > CURRENT_SCHEMA {
                return Err(format!(
                    "Backup-Schema {} ist neuer als die App-Version (Schema {}). Bitte App aktualisieren.",
                    parsed.db_schema_version, CURRENT_SCHEMA
                ));
            }
            manifest_ok = true;
            continue;
        }
        let target = pending_root.join(&name);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = File::create(&target).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        if name == DB_ENTRY {
            found_db = true;
        }
    }
    if !manifest_ok {
        let _ = fs::remove_dir_all(&pending_root);
        return Err("Kein manifest.json im Backup gefunden.".into());
    }
    if !found_db {
        let _ = fs::remove_dir_all(&pending_root);
        return Err("Keine zettel.db im Backup gefunden.".into());
    }

    // Marker schreiben
    fs::write(app_data_dir(&app)?.join(PENDING_MARKER), b"pending")
        .map_err(|e| e.to_string())?;
    Ok(pending_root.to_string_lossy().into_owned())
}

/// Called at startup, BEFORE the SQL plugin opens the DB. Runs without an
/// AppHandle (the builder hasn't initialized yet). Best-effort: errors are
/// logged to stderr and the marker is removed so the app can still boot.
pub fn apply_pending_restore_blocking() {
    let data_dir = match app_data_dir_static() {
        Some(d) => d,
        None => {
            eprintln!("[backup] could not resolve data dir");
            return;
        }
    };
    let marker = data_dir.join(PENDING_MARKER);
    if !marker.exists() {
        return;
    }
    let pending_root = data_dir.join(PENDING_DIR);
    if !pending_root.is_dir() {
        let _ = fs::remove_file(&marker);
        return;
    }

    let pending_db = pending_root.join(DB_ENTRY);
    if pending_db.is_file() {
        let target = data_dir.join("zettel.db");
        if target.exists() {
            let bak = target.with_extension("db.bak");
            let _ = fs::rename(&target, &bak);
        }
        if let Err(e) = fs::rename(&pending_db, &target).or_else(|_| {
            fs::copy(&pending_db, &target).map(|_| ())
        }) {
            eprintln!("[backup] could not place restored DB: {}", e);
        }
    }

    let pending_pdfs = pending_root.join(PDF_DIR_ENTRY);
    if pending_pdfs.is_dir() {
        if let Some(zettel_dir) = documents_zettel_dir_static() {
            let target_root = zettel_dir.join("Rechnungen");
            let _ = fs::create_dir_all(&target_root);
            for entry in WalkDir::new(&pending_pdfs).into_iter().filter_map(|e| e.ok()) {
                let p = entry.path();
                if !p.is_file() {
                    continue;
                }
                let rel = match p.strip_prefix(&pending_pdfs) {
                    Ok(r) => r,
                    Err(_) => continue,
                };
                let dest = target_root.join(rel);
                if let Some(parent) = dest.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::copy(p, dest);
            }
        }
    }

    let _ = fs::remove_dir_all(&pending_root);
    let _ = fs::remove_file(&marker);
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{}", secs)
}
