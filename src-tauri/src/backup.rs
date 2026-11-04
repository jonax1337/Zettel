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
//!     a marker file plus the restore mode and the DB file active right now
//!     (default, sandbox or custom tenant). The DB is locked while the app
//!     runs, so a full restore is applied on next startup.
//!   • **Apply pending** — called once during `run()` BEFORE the SQL plugin
//!     initializes; if the marker file exists it moves staged files into
//!     place and removes the pending dir.

use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::crypto;
use crate::paths::{
    app_config_dir, app_config_dir_static, app_data_dir, app_data_dir_static,
    documents_zettel_dir, documents_zettel_dir_static,
};
use crate::tenants;

/// Newest DB schema this app can restore. Must stay in sync with
/// `CURRENT_DB_SCHEMA_VERSION` in `src/routes/settings/{Advanced,Data}.svelte`
/// and the highest migration version in `lib.rs` (a test in `lib.rs` checks
/// the latter).
pub(crate) const CURRENT_SCHEMA: u32 = 28;

const MANIFEST_NAME: &str = "manifest.json";
const DB_ENTRY: &str = "zettel.db";
const PDF_DIR_ENTRY: &str = "Rechnungen";
const OFFER_PDF_DIR_ENTRY: &str = "Angebote";
const PDF_SUBDIRS: [&str; 2] = [PDF_DIR_ENTRY, OFFER_PDF_DIR_ENTRY];
const PENDING_DIR: &str = "pending_restore";
const PENDING_MARKER: &str = "RESTORE_PENDING";
const RESTORE_MODE_FILE: &str = "restore_mode.json";
const SNAPSHOT_FILE: &str = "zettel.backup.tmp.db";
const DECRYPTED_TMP_FILE: &str = "restore_decrypted.tmp.zip";
/// Error code the frontend matches on to prompt for a password.
const PASSWORD_REQUIRED: &str = "password_required";

const CUSTOMER_TABLES: [&str; 1] = ["customers"];
/// Children before their parents, so deleting in this order is FK-safe.
const INVOICE_TABLES: [&str; 6] = [
    "invoice_items",
    "invoices",
    "offer_items",
    "offers",
    "recurring_invoice_items",
    "recurring_invoices",
];
const SETTINGS_TABLES: [&str; 1] = ["settings"];
/// Oldest backup schema a partial restore accepts. Migration 0018 (schema 19)
/// is the last one that rewrites data in restorable tables; an older backup
/// copied column by column would skip those fixes. A full restore still works,
/// because the SQL plugin migrates the replaced DB when it opens it.
const MIN_PARTIAL_RESTORE_SCHEMA: u32 = 19;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PartialRestoreSections {
    pub customers: bool,
    pub invoices: bool,
    pub settings: bool,
}

impl PartialRestoreSections {
    fn is_everything(&self) -> bool {
        self.customers && self.invoices && self.settings
    }

    /// Tables to replace, children before parents.
    fn tables(&self) -> Vec<&'static str> {
        let mut tables = Vec::new();
        if self.customers {
            tables.extend(CUSTOMER_TABLES);
        }
        if self.invoices {
            tables.extend(INVOICE_TABLES);
        }
        if self.settings {
            tables.extend(SETTINGS_TABLES);
        }
        tables
    }
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
enum RestoreMode {
    Full,
    Partial { sections: PartialRestoreSections },
}

impl RestoreMode {
    /// No section selection, or all sections, is a full restore, which
    /// replaces the DB file before the SQL plugin opens it.
    fn from_sections(sections: Option<PartialRestoreSections>) -> Self {
        match sections {
            Some(s) if !s.is_everything() => RestoreMode::Partial { sections: s },
            _ => RestoreMode::Full,
        }
    }
}

/// Content of `RESTORE_MODE_FILE`, written by `stage_restore`.
#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct StagedRestore {
    #[serde(flatten)]
    mode: RestoreMode,
    /// The DB active when the restore was staged. Not re-resolved on apply:
    /// switching sandbox or tenant relaunches the app, and that startup would
    /// otherwise overwrite the switched-to DB. Absent in files staged by
    /// older app versions.
    #[serde(default)]
    target_db: Option<PathBuf>,
}

impl StagedRestore {
    fn resolve_target(&self, data_dir: &Path, config_dir: &Path) -> PathBuf {
        self.target_db
            .clone()
            .unwrap_or_else(|| tenants::active_db_file(data_dir, config_dir))
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct BackupManifest {
    app_version: String,
    created_at: String,
    db_schema_version: u32,
    invoice_count: Option<u32>,
}

impl BackupManifest {
    fn new(db_schema_version: u32, invoice_count: Option<u32>) -> Self {
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Self {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            created_at: format!("unix:{secs}"),
            db_schema_version,
            invoice_count,
        }
    }

    fn parse_supported(json: &str) -> Result<Self, String> {
        let manifest: Self =
            serde_json::from_str(json).map_err(|e| format!("invalid manifest: {e}"))?;
        if manifest.db_schema_version > CURRENT_SCHEMA {
            return Err(format!(
                "Backup-Schema {} ist neuer als die App-Version (Schema {}). Bitte App aktualisieren.",
                manifest.db_schema_version, CURRENT_SCHEMA
            ));
        }
        Ok(manifest)
    }
}

/// Deletes the file when dropped, so decrypted backup material never outlives
/// a failed restore.
struct TempFile(PathBuf);

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

#[tauri::command]
pub async fn auto_backup_target(app: AppHandle, filename: String) -> Result<String, String> {
    // Bevorzugt <Documents>/Zettel/Backups/. Wenn Documents nicht erreichbar
    // ist (OneDrive offline, Known-Folder leer, OS error 2 …), fallback in
    // den App-Data-Dir — der existiert immer (App läuft ja daraus).
    let preferred = documents_zettel_dir(&app).map(|d| d.join("Backups"));
    if let Ok(dir) = preferred {
        if fs::create_dir_all(&dir).is_ok() {
            return Ok(path_string(&dir.join(&filename)));
        }
    }
    let fallback = app_data_dir(&app)?.join("Backups");
    fs::create_dir_all(&fallback).map_err(|e| e.to_string())?;
    Ok(path_string(&fallback.join(filename)))
}

/// The frontend issues `VACUUM INTO ?` against the live SQLite connection to
/// produce a consistent snapshot at the returned path, which must not exist.
#[tauri::command]
pub async fn snapshot_db_path(app: AppHandle) -> Result<String, String> {
    let data_dir = app_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let snapshot = data_dir.join(SNAPSHOT_FILE);
    match fs::remove_file(&snapshot) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => {
            return Err(format!("Alter Snapshot nicht löschbar: {e}"));
        }
        _ => {}
    }
    Ok(path_string(&snapshot))
}

#[tauri::command]
pub async fn bundle_backup(
    app: AppHandle,
    snapshot_path: String,
    target_zip: String,
    invoice_count: Option<u32>,
    db_schema_version: u32,
    password: Option<String>,
) -> Result<String, String> {
    let snapshot = PathBuf::from(&snapshot_path);
    if !snapshot.is_file() {
        return Err(format!("snapshot missing: {snapshot_path}"));
    }
    let target = PathBuf::from(&target_zip);
    let manifest = BackupManifest::new(db_schema_version, invoice_count);
    let documents_root = documents_zettel_dir(&app)?;

    let written = write_backup_zip(&target, &snapshot, &manifest, &documents_root).and_then(|()| {
        match password {
            Some(pw) => encrypt_file_in_place(&target, pw),
            None => Ok(()),
        }
    });
    if let Err(e) = written {
        let _ = fs::remove_file(&target);
        return Err(e);
    }

    let _ = fs::remove_file(&snapshot);
    Ok(path_string(&target))
}

fn write_backup_zip(
    target: &Path,
    snapshot: &Path,
    manifest: &BackupManifest,
    documents_root: &Path,
) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut zip = ZipWriter::new(File::create(target).map_err(|e| e.to_string())?);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let manifest_json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    zip.start_file(MANIFEST_NAME, options).map_err(|e| e.to_string())?;
    zip.write_all(manifest_json.as_bytes()).map_err(|e| e.to_string())?;

    add_file(&mut zip, DB_ENTRY, snapshot, options)?;

    for sub in PDF_SUBDIRS {
        let pdf_root = documents_root.join(sub);
        if !pdf_root.is_dir() {
            continue;
        }
        for (path, relative) in files_below(&pdf_root)? {
            let entry_name = format!("{sub}/{}", relative.to_string_lossy().replace('\\', "/"));
            add_file(&mut zip, &entry_name, &path, options)?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn add_file(
    zip: &mut ZipWriter<File>,
    entry_name: &str,
    source: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    zip.start_file(entry_name, options).map_err(|e| e.to_string())?;
    let mut file = File::open(source).map_err(|e| format!("{}: {e}", source.display()))?;
    io::copy(&mut file, zip).map_err(|e| format!("{}: {e}", source.display()))?;
    Ok(())
}

fn encrypt_file_in_place(path: &Path, mut password: String) -> Result<(), String> {
    let plain = fs::read(path).map_err(|e| e.to_string())?;
    let encrypted = crypto::encrypt(&plain, &mut password)?;
    fs::write(path, encrypted).map_err(|e| e.to_string())
}

/// Every file below `root` as (absolute path, path relative to `root`).
/// Unreadable entries are an error: a backup must not silently miss PDFs.
fn files_below(root: &Path) -> Result<Vec<(PathBuf, PathBuf)>, String> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root) {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_path_buf();
        files.push((entry.into_path(), relative));
    }
    Ok(files)
}

/// Copies the invoice and offer PDF folders from `from_root` into `to_root`,
/// overwriting files that already exist. A file that cannot be copied (e.g.
/// locked by a PDF viewer) does not stop the others: the staged copies are
/// deleted afterwards, so every skipped file would be lost.
fn copy_pdf_dirs(from_root: &Path, to_root: &Path) -> Result<(), String> {
    let mut failures = Vec::new();
    for sub in PDF_SUBDIRS {
        let source_root = from_root.join(sub);
        if !source_root.is_dir() {
            continue;
        }
        for (path, relative) in files_below(&source_root)? {
            let destination = to_root.join(sub).join(relative);
            if let Err(e) = copy_file(&path, &destination) {
                failures.push(format!("{}: {e}", destination.display()));
            }
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("; "))
    }
}

fn copy_file(source: &Path, destination: &Path) -> io::Result<()> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source, destination).map(|_| ())
}

#[tauri::command]
pub async fn stage_restore(
    app: AppHandle,
    source_zip: String,
    sections: Option<PartialRestoreSections>,
    password: Option<String>,
) -> Result<String, String> {
    let source = PathBuf::from(&source_zip);
    if !source.is_file() {
        return Err(format!("ZIP missing: {source_zip}"));
    }
    let data_dir = app_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let staged = StagedRestore {
        mode: RestoreMode::from_sections(sections),
        target_db: Some(tenants::active_db_file(&data_dir, &app_config_dir(&app)?)),
    };

    let decrypted = if is_encrypted_file(&source)? {
        Some(decrypt_to_temp(&source, password, &data_dir)?)
    } else {
        None
    };
    let zip_path = decrypted.as_ref().map_or(source.as_path(), |tmp| tmp.0.as_path());

    let pending_root = data_dir.join(PENDING_DIR);
    if pending_root.exists() {
        fs::remove_dir_all(&pending_root).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&pending_root).map_err(|e| e.to_string())?;

    if let Err(e) = extract_backup(zip_path, &pending_root) {
        let _ = fs::remove_dir_all(&pending_root);
        return Err(e);
    }

    if let Err(e) = write_staged_restore(&data_dir, &staged) {
        clear_pending(&data_dir);
        return Err(e);
    }
    Ok(path_string(&pending_root))
}

fn write_staged_restore(data_dir: &Path, staged: &StagedRestore) -> Result<(), String> {
    let json = serde_json::to_string_pretty(staged).map_err(|e| e.to_string())?;
    fs::write(data_dir.join(RESTORE_MODE_FILE), json).map_err(|e| e.to_string())?;
    fs::write(data_dir.join(PENDING_MARKER), b"pending").map_err(|e| e.to_string())
}

/// Plain ZIPs never start with our magic header, so the prefix check is
/// unambiguous.
fn is_encrypted_file(path: &Path) -> Result<bool, String> {
    let mut head = Vec::new();
    File::open(path)
        .map_err(|e| e.to_string())?
        .take(crypto::MAGIC.len() as u64)
        .read_to_end(&mut head)
        .map_err(|e| e.to_string())?;
    Ok(crypto::is_encrypted(&head))
}

fn decrypt_to_temp(
    source: &Path,
    password: Option<String>,
    data_dir: &Path,
) -> Result<TempFile, String> {
    let mut password = password
        .filter(|p| !p.is_empty())
        .ok_or_else(|| PASSWORD_REQUIRED.to_string())?;
    let blob = fs::read(source).map_err(|e| e.to_string())?;
    let plain = crypto::decrypt(&blob, &mut password)?;
    let tmp = TempFile(data_dir.join(DECRYPTED_TMP_FILE));
    fs::write(&tmp.0, plain).map_err(|e| e.to_string())?;
    Ok(tmp)
}

/// Extracts a backup ZIP into `pending_root` after checking that it carries a
/// manifest of a supported schema and a database.
fn extract_backup(zip_path: &Path, pending_root: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut found_manifest = false;
    let mut found_db = false;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| format!("Unsicherer Pfad im Backup: {}", entry.name()))?;

        if relative == Path::new(MANIFEST_NAME) {
            let mut content = String::new();
            entry.read_to_string(&mut content).map_err(|e| e.to_string())?;
            BackupManifest::parse_supported(&content)?;
            found_manifest = true;
            continue;
        }

        let target = pending_root.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = File::create(&target).map_err(|e| e.to_string())?;
        io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        found_db |= relative == Path::new(DB_ENTRY);
    }

    if !found_manifest {
        return Err("Kein manifest.json im Backup gefunden.".into());
    }
    if !found_db {
        return Err("Keine zettel.db im Backup gefunden.".into());
    }
    Ok(())
}

fn read_staged_restore(data_dir: &Path) -> StagedRestore {
    let assume_full = StagedRestore { mode: RestoreMode::Full, target_db: None };
    let Ok(json) = fs::read_to_string(data_dir.join(RESTORE_MODE_FILE)) else {
        return assume_full;
    };
    serde_json::from_str(&json).unwrap_or_else(|e| {
        eprintln!("[backup] unreadable {RESTORE_MODE_FILE}, assuming full restore: {e}");
        assume_full
    })
}

/// Removes the staged restore and its marker files.
fn clear_pending(data_dir: &Path) {
    let results = [
        fs::remove_dir_all(data_dir.join(PENDING_DIR)),
        fs::remove_file(data_dir.join(PENDING_MARKER)),
        fs::remove_file(data_dir.join(RESTORE_MODE_FILE)),
    ];
    for error in results.into_iter().filter_map(Result::err) {
        if error.kind() != io::ErrorKind::NotFound {
            eprintln!("[backup] could not clear pending restore: {error}");
        }
    }
}

/// Called at startup, BEFORE the SQL plugin opens the DB. Runs without an
/// AppHandle (the builder hasn't initialized yet). Best-effort: errors are
/// logged to stderr and the marker is removed so the app can still boot.
pub fn apply_pending_restore_blocking() {
    let (Some(data_dir), Some(config_dir)) = (app_data_dir_static(), app_config_dir_static())
    else {
        eprintln!("[backup] could not resolve app data/config dir");
        return;
    };
    apply_pending_full_restore(&data_dir, &config_dir, documents_zettel_dir_static().as_deref());
}

fn apply_pending_full_restore(data_dir: &Path, config_dir: &Path, documents_dir: Option<&Path>) {
    if !data_dir.join(PENDING_MARKER).exists() {
        return;
    }
    let pending_root = data_dir.join(PENDING_DIR);
    if !pending_root.is_dir() {
        clear_pending(data_dir);
        return;
    }
    let staged = read_staged_restore(data_dir);
    // Partial restore is triggered post-init by the frontend.
    if matches!(staged.mode, RestoreMode::Partial { .. }) {
        return;
    }

    let pending_db = pending_root.join(DB_ENTRY);
    if pending_db.is_file() {
        let target = staged.resolve_target(data_dir, config_dir);
        if let Err(e) = place_restored_db(&pending_db, &target) {
            eprintln!("[backup] could not place restored DB at {}: {e}", target.display());
        }
    }
    if let Some(documents_dir) = documents_dir {
        if let Err(e) = copy_pdf_dirs(&pending_root, documents_dir) {
            eprintln!("[backup] could not restore PDFs: {e}");
        }
    }
    clear_pending(data_dir);
}

/// Moves the staged DB over the live one, keeping the previous DB as `.db.bak`.
/// If the staged DB cannot be placed, the previous DB is moved back so the
/// app does not start on an empty database.
fn place_restored_db(pending_db: &Path, live_db: &Path) -> Result<(), String> {
    if let Some(parent) = live_db.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let backup = live_db.with_extension("db.bak");
    let mut kept_backup = false;
    if live_db.exists() {
        match fs::rename(live_db, &backup) {
            Ok(()) => kept_backup = true,
            Err(e) => eprintln!("[backup] could not keep previous DB as {}: {e}", backup.display()),
        }
    }
    let placed = fs::rename(pending_db, live_db)
        .or_else(|_| fs::copy(pending_db, live_db).map(|_| ()))
        .map_err(|e| e.to_string());
    if placed.is_err() && kept_backup {
        if let Err(e) = fs::rename(&backup, live_db) {
            eprintln!("[backup] could not move previous DB back from {}: {e}", backup.display());
        }
    }
    placed
}

/// Post-init partial restore. Runs after the SQL plugin opened the DB — opens a
/// second `rusqlite` connection to the same file (SQLite handles concurrent
/// connections via locks), attaches the staged backup DB, and copies only
/// the chosen sections inside a single transaction.
#[tauri::command]
pub async fn apply_pending_partial_restore(app: AppHandle) -> Result<(), String> {
    let data_dir = app_data_dir(&app)?;
    let config_dir = app_config_dir(&app)?;
    let documents_dir = documents_zettel_dir(&app)
        .inspect_err(|e| eprintln!("[backup] documents dir unavailable, PDFs not restored: {e}"))
        .ok();
    apply_partial_restore(&data_dir, &config_dir, documents_dir.as_deref())
}

/// Clears the staged files after every attempt, failed ones included: the
/// frontend stages again for each attempt, and a failed one must not leave
/// the (possibly decrypted) backup behind in the app-data dir.
fn apply_partial_restore(
    data_dir: &Path,
    config_dir: &Path,
    documents_dir: Option<&Path>,
) -> Result<(), String> {
    let pending_root = data_dir.join(PENDING_DIR);
    if !data_dir.join(PENDING_MARKER).exists() || !pending_root.is_dir() {
        return Err("Keine ausstehende Wiederherstellung gefunden.".into());
    }
    let staged = read_staged_restore(data_dir);
    let RestoreMode::Partial { sections } = staged.mode else {
        return Err("Volle Wiederherstellung — bitte App neu starten.".into());
    };

    let target = staged.resolve_target(data_dir, config_dir);
    let restored = restore_staged_sections(&pending_root, &target, sections, documents_dir);
    clear_pending(data_dir);
    restored
}

fn restore_staged_sections(
    pending_root: &Path,
    live_db: &Path,
    sections: PartialRestoreSections,
    documents_dir: Option<&Path>,
) -> Result<(), String> {
    let staged_db = pending_root.join(DB_ENTRY);
    if !staged_db.is_file() {
        return Err("Backup-Datenbank fehlt im pending-Ordner.".into());
    }
    restore_sections(live_db, &staged_db, sections)?;

    if let (true, Some(documents_dir)) = (sections.invoices, documents_dir) {
        if let Err(e) = copy_pdf_dirs(pending_root, documents_dir) {
            eprintln!("[backup] could not restore PDFs: {e}");
        }
    }
    Ok(())
}

/// Replaces the selected sections of `live_db` with those of `staged_db`.
/// All-or-nothing: any failure rolls the transaction back.
fn restore_sections(
    live_db: &Path,
    staged_db: &Path,
    sections: PartialRestoreSections,
) -> Result<(), String> {
    let tables = sections.tables();
    let mut conn = rusqlite::Connection::open(live_db).map_err(|e| e.to_string())?;
    // Both must run outside the transaction: `PRAGMA foreign_keys` is a no-op
    // inside one and ATTACH is rejected. Dropping the connection detaches.
    conn.execute_batch("PRAGMA foreign_keys=OFF;")
        .map_err(|e| e.to_string())?;
    conn.execute(
        "ATTACH DATABASE ?1 AS bak",
        [staged_db.to_string_lossy().as_ref()],
    )
    .map_err(|e| e.to_string())?;
    ensure_partially_restorable(&conn)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for table in &tables {
        tx.execute_batch(&format!("DELETE FROM main.{table};"))
            .map_err(|e| format!("{table}: {e}"))?;
    }
    // Parents before children — the reverse of the deletion order.
    for table in tables.iter().rev() {
        let columns = shared_columns(&tx, table).map_err(|e| format!("{table}: {e}"))?;
        tx.execute_batch(&format!(
            "INSERT INTO main.{table} ({columns}) SELECT {columns} FROM bak.{table};"
        ))
        .map_err(|e| format!("{table}: {e}"))?;
    }
    tx.commit().map_err(|e| e.to_string())
}

fn ensure_partially_restorable(conn: &rusqlite::Connection) -> Result<(), String> {
    let backup_schema: u32 = conn
        .query_row("PRAGMA bak.user_version", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if backup_schema < MIN_PARTIAL_RESTORE_SCHEMA {
        return Err(format!(
            "Backup-Schema {backup_schema} ist zu alt für eine Teil-Wiederherstellung (mindestens Schema {MIN_PARTIAL_RESTORE_SCHEMA}). Bitte alle Bereiche wiederherstellen."
        ));
    }
    Ok(())
}

/// Quoted, comma-separated columns present in both `main.table` and
/// `bak.table`. A backup from an older schema lacks newer columns; those fall
/// back to their DB defaults instead of failing the column-count match.
fn shared_columns(conn: &rusqlite::Connection, table: &str) -> Result<String, String> {
    let columns_of = |schema: &str| -> rusqlite::Result<Vec<String>> {
        conn.prepare("SELECT name FROM pragma_table_info(?1, ?2)")?
            .query_map([table, schema], |row| row.get(0))?
            .collect()
    };
    let backup_columns = columns_of("bak").map_err(|e| e.to_string())?;
    let shared: Vec<String> = columns_of("main")
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|column| backup_columns.contains(column))
        .map(|column| format!("\"{}\"", column.replace('"', "\"\"")))
        .collect();
    if shared.is_empty() {
        return Err("Tabelle fehlt im Backup.".into());
    }
    Ok(shared.join(", "))
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox;
    use crate::testutil::TempDir;
    use rusqlite::Connection;

    const ALL_TABLES: [&str; 8] = [
        "customers",
        "invoice_items",
        "invoices",
        "offer_items",
        "offers",
        "recurring_invoice_items",
        "recurring_invoices",
        "settings",
    ];

    fn sections(customers: bool, invoices: bool, settings: bool) -> PartialRestoreSections {
        PartialRestoreSections { customers, invoices, settings }
    }

    fn partial(sections: PartialRestoreSections) -> RestoreMode {
        RestoreMode::Partial { sections }
    }

    /// DB at the current schema version, as a backup snapshot would be.
    fn open_current_db(path: &Path) -> Connection {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {CURRENT_SCHEMA};")).unwrap();
        conn
    }

    /// DB with every restorable table holding one row tagged `tag`.
    fn create_db(path: &Path, tag: &str) {
        let conn = open_current_db(path);
        for table in ALL_TABLES {
            conn.execute_batch(&format!(
                "CREATE TABLE {table} (id INTEGER PRIMARY KEY, tag TEXT);
                 INSERT INTO {table} (tag) VALUES ('{tag}');"
            ))
            .unwrap();
        }
    }

    fn tag_of(path: &Path, table: &str) -> String {
        Connection::open(path)
            .unwrap()
            .query_row(&format!("SELECT tag FROM {table}"), [], |row| row.get(0))
            .unwrap()
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let mut zip = ZipWriter::new(File::create(path).unwrap());
        for (name, content) in entries {
            zip.start_file(*name, SimpleFileOptions::default()).unwrap();
            zip.write_all(content).unwrap();
        }
        zip.finish().unwrap();
    }

    fn manifest_json(schema: u32) -> String {
        serde_json::to_string(&BackupManifest::new(schema, Some(3))).unwrap()
    }

    /// Separate app-data, app-config and documents dirs, as on Linux.
    struct AppDirs {
        root: TempDir,
        data: PathBuf,
        config: PathBuf,
        documents: PathBuf,
    }

    impl AppDirs {
        fn new(label: &str) -> Self {
            let root = TempDir::new(label);
            let [data, config, documents] =
                ["data", "config", "documents"].map(|name| root.path().join(name));
            for dir in [&data, &config] {
                fs::create_dir_all(dir).unwrap();
            }
            Self { root, data, config, documents }
        }

        /// Writes what `stage_restore` leaves behind and returns the pending dir.
        fn stage(&self, mode: RestoreMode, target_db: Option<PathBuf>) -> PathBuf {
            let pending = self.data.join(PENDING_DIR);
            fs::create_dir_all(&pending).unwrap();
            write_staged_restore(&self.data, &StagedRestore { mode, target_db }).unwrap();
            pending
        }
    }

    #[test]
    fn selecting_everything_or_nothing_is_a_full_restore() {
        assert_eq!(RestoreMode::from_sections(None), RestoreMode::Full);
        assert_eq!(
            RestoreMode::from_sections(Some(sections(true, true, true))),
            RestoreMode::Full
        );
        assert_eq!(
            RestoreMode::from_sections(Some(sections(true, false, true))),
            RestoreMode::Partial { sections: sections(true, false, true) }
        );
    }

    #[test]
    fn restore_sections_replaces_only_selected_tables() {
        let dir = TempDir::new("restore-sections");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");

        restore_sections(&live, &staged, sections(true, false, true)).unwrap();

        assert_eq!(tag_of(&live, "customers"), "backup");
        assert_eq!(tag_of(&live, "settings"), "backup");
        assert_eq!(tag_of(&live, "invoices"), "live");
        assert_eq!(tag_of(&live, "offers"), "live");
    }

    #[test]
    fn restore_sections_covers_all_invoice_tables() {
        let dir = TempDir::new("restore-invoices");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");

        restore_sections(&live, &staged, sections(false, true, false)).unwrap();

        for table in INVOICE_TABLES {
            assert_eq!(tag_of(&live, table), "backup", "{table}");
        }
        assert_eq!(tag_of(&live, "customers"), "live");
    }

    #[test]
    fn restore_sections_rolls_back_when_a_table_is_missing_in_the_backup() {
        let dir = TempDir::new("restore-rollback");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        open_current_db(&staged)
            .execute_batch("CREATE TABLE customers (id INTEGER PRIMARY KEY, tag TEXT);")
            .unwrap();

        let result = restore_sections(&live, &staged, sections(true, false, true));

        assert!(result.is_err());
        assert_eq!(tag_of(&live, "customers"), "live");
        assert_eq!(tag_of(&live, "settings"), "live");
    }

    #[test]
    fn restore_sections_fills_columns_missing_in_an_older_backup_with_defaults() {
        let dir = TempDir::new("restore-older-schema");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        Connection::open(&live)
            .unwrap()
            .execute_batch("ALTER TABLE settings ADD COLUMN \"vat accounting\" TEXT NOT NULL DEFAULT 'accrual';")
            .unwrap();
        create_db(&staged, "backup");

        restore_sections(&live, &staged, sections(false, false, true)).unwrap();

        let vat_accounting: String = Connection::open(&live)
            .unwrap()
            .query_row("SELECT \"vat accounting\" FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(tag_of(&live, "settings"), "backup");
        assert_eq!(vat_accounting, "accrual");
    }

    #[test]
    fn restore_sections_ignores_columns_the_live_schema_does_not_have() {
        let dir = TempDir::new("restore-newer-columns");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");
        Connection::open(&staged)
            .unwrap()
            .execute_batch("ALTER TABLE customers ADD COLUMN extra TEXT;")
            .unwrap();

        restore_sections(&live, &staged, sections(true, false, false)).unwrap();

        assert_eq!(tag_of(&live, "customers"), "backup");
    }

    #[test]
    fn restore_sections_rejects_backups_older_than_the_last_data_migration() {
        let dir = TempDir::new("restore-too-old");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");
        let set_backup_schema = |version: u32| {
            Connection::open(&staged)
                .unwrap()
                .execute_batch(&format!("PRAGMA user_version = {version};"))
                .unwrap();
        };

        set_backup_schema(MIN_PARTIAL_RESTORE_SCHEMA - 1);
        let err = restore_sections(&live, &staged, sections(true, false, false)).unwrap_err();
        assert!(err.contains("zu alt"), "{err}");
        assert_eq!(tag_of(&live, "customers"), "live");

        set_backup_schema(MIN_PARTIAL_RESTORE_SCHEMA);
        restore_sections(&live, &staged, sections(true, false, false)).unwrap();
        assert_eq!(tag_of(&live, "customers"), "backup");
    }

    #[test]
    fn manifest_accepts_older_schemas_and_rejects_newer_ones() {
        assert!(BackupManifest::parse_supported(&manifest_json(CURRENT_SCHEMA - 1)).is_ok());
        assert!(BackupManifest::parse_supported(&manifest_json(CURRENT_SCHEMA)).is_ok());
        assert!(BackupManifest::parse_supported(&manifest_json(CURRENT_SCHEMA + 1)).is_err());
    }

    #[test]
    fn backup_roundtrip_preserves_db_and_pdfs() {
        let dir = TempDir::new("roundtrip");
        let documents = dir.path().join("documents");
        fs::create_dir_all(documents.join("Rechnungen/2026")).unwrap();
        fs::write(documents.join("Rechnungen/2026/RE-1.pdf"), b"pdf-bytes").unwrap();
        let snapshot = dir.path().join("snapshot.db");
        fs::write(&snapshot, b"db-bytes").unwrap();
        let zip_path = dir.path().join("backup.zip");

        let manifest = BackupManifest::new(CURRENT_SCHEMA, Some(1));
        write_backup_zip(&zip_path, &snapshot, &manifest, &documents).unwrap();
        let pending = dir.path().join("pending");
        extract_backup(&zip_path, &pending).unwrap();

        assert_eq!(fs::read(pending.join(DB_ENTRY)).unwrap(), b"db-bytes");
        assert_eq!(fs::read(pending.join("Rechnungen/2026/RE-1.pdf")).unwrap(), b"pdf-bytes");
    }

    #[test]
    fn extract_rejects_entries_escaping_the_pending_dir() {
        let dir = TempDir::new("zip-slip");
        let zip_path = dir.path().join("evil.zip");
        let manifest = manifest_json(CURRENT_SCHEMA);
        write_zip(
            &zip_path,
            &[
                (MANIFEST_NAME, manifest.as_bytes()),
                (DB_ENTRY, b"db"),
                ("../escaped.txt", b"gotcha"),
            ],
        );
        let pending = dir.path().join("pending");

        let err = extract_backup(&zip_path, &pending).unwrap_err();

        assert!(err.contains("Unsicherer Pfad"), "{err}");
        assert!(!dir.path().join("escaped.txt").exists());
    }

    #[test]
    fn extract_rejects_schema_newer_than_the_app() {
        let dir = TempDir::new("schema-too-new");
        let zip_path = dir.path().join("new.zip");
        let manifest = manifest_json(CURRENT_SCHEMA + 1);
        write_zip(&zip_path, &[(MANIFEST_NAME, manifest.as_bytes()), (DB_ENTRY, b"db")]);

        let err = extract_backup(&zip_path, &dir.path().join("pending")).unwrap_err();

        assert!(err.contains("neuer als die App-Version"), "{err}");
    }

    #[test]
    fn extract_requires_manifest_and_database() {
        let dir = TempDir::new("incomplete");
        let manifest = manifest_json(CURRENT_SCHEMA);

        let without_manifest = dir.path().join("a.zip");
        write_zip(&without_manifest, &[(DB_ENTRY, b"db")]);
        let err = extract_backup(&without_manifest, &dir.path().join("p1")).unwrap_err();
        assert!(err.contains("manifest.json"), "{err}");

        let without_db = dir.path().join("b.zip");
        write_zip(&without_db, &[(MANIFEST_NAME, manifest.as_bytes())]);
        let err = extract_backup(&without_db, &dir.path().join("p2")).unwrap_err();
        assert!(err.contains("zettel.db"), "{err}");
    }

    #[test]
    fn decrypt_requires_a_password() {
        let dir = TempDir::new("password-required");
        let encrypted = dir.path().join("enc.zip");
        fs::write(&encrypted, b"plain zip").unwrap();
        encrypt_file_in_place(&encrypted, "secret".to_string()).unwrap();
        assert!(is_encrypted_file(&encrypted).unwrap());

        for missing in [None, Some(String::new())] {
            let err = decrypt_to_temp(&encrypted, missing, dir.path()).err().unwrap();
            assert_eq!(err, PASSWORD_REQUIRED);
        }
    }

    #[test]
    fn decrypted_temp_file_is_removed_on_drop() {
        let dir = TempDir::new("temp-file");
        let encrypted = dir.path().join("enc.zip");
        fs::write(&encrypted, b"plain zip").unwrap();
        encrypt_file_in_place(&encrypted, "secret".to_string()).unwrap();

        let tmp = decrypt_to_temp(&encrypted, Some("secret".into()), dir.path()).unwrap();
        let tmp_path = tmp.0.clone();
        assert_eq!(fs::read(&tmp_path).unwrap(), b"plain zip");
        drop(tmp);

        assert!(!tmp_path.exists());
    }

    #[test]
    fn full_restore_replaces_db_keeps_previous_one_and_restores_pdfs() {
        let dirs = AppDirs::new("full-restore");
        let live = dirs.config.join("zettel.db");
        fs::write(&live, b"old").unwrap();
        let pending = dirs.stage(RestoreMode::Full, Some(live.clone()));
        fs::write(pending.join(DB_ENTRY), b"restored").unwrap();
        fs::create_dir_all(pending.join("Angebote")).unwrap();
        fs::write(pending.join("Angebote/AN-1.pdf"), b"offer").unwrap();

        apply_pending_full_restore(&dirs.data, &dirs.config, Some(&dirs.documents));

        assert_eq!(fs::read(&live).unwrap(), b"restored");
        assert_eq!(fs::read(dirs.config.join("zettel.db.bak")).unwrap(), b"old");
        assert_eq!(fs::read(dirs.documents.join("Angebote/AN-1.pdf")).unwrap(), b"offer");
        assert!(!pending.exists());
        assert!(!dirs.data.join(PENDING_MARKER).exists());
        assert!(!dirs.data.join(RESTORE_MODE_FILE).exists());
    }

    #[test]
    fn full_restore_replaces_the_custom_tenant_db_instead_of_the_default_one() {
        let dirs = AppDirs::new("full-restore-tenant");
        let default_db = dirs.config.join("zettel.db");
        fs::write(&default_db, b"default").unwrap();
        let tenant_db = dirs.root.path().join("cloud").join("tenant.db");
        fs::create_dir_all(tenant_db.parent().unwrap()).unwrap();
        fs::write(&tenant_db, b"tenant-old").unwrap();
        let pending = dirs.stage(RestoreMode::Full, Some(tenant_db.clone()));
        fs::write(pending.join(DB_ENTRY), b"restored").unwrap();

        apply_pending_full_restore(&dirs.data, &dirs.config, None);

        assert_eq!(fs::read(&tenant_db).unwrap(), b"restored");
        assert_eq!(fs::read(tenant_db.with_extension("db.bak")).unwrap(), b"tenant-old");
        assert_eq!(fs::read(&default_db).unwrap(), b"default");
    }

    #[test]
    fn full_restore_targets_the_db_recorded_at_staging_even_after_a_sandbox_switch() {
        let dirs = AppDirs::new("full-restore-switch");
        let pending = dirs.stage(RestoreMode::Full, Some(dirs.config.join("zettel.db")));
        fs::write(pending.join(DB_ENTRY), b"restored").unwrap();
        fs::write(dirs.data.join(sandbox::FLAG_FILE), b"1").unwrap();

        apply_pending_full_restore(&dirs.data, &dirs.config, None);

        assert_eq!(fs::read(dirs.config.join("zettel.db")).unwrap(), b"restored");
        assert!(!dirs.config.join("zettel-sandbox.db").exists());
    }

    #[test]
    fn full_restore_staged_without_a_target_replaces_the_active_db() {
        let dirs = AppDirs::new("full-restore-legacy");
        let pending = dirs.data.join(PENDING_DIR);
        fs::create_dir_all(&pending).unwrap();
        fs::write(pending.join(DB_ENTRY), b"restored").unwrap();
        fs::write(dirs.data.join(RESTORE_MODE_FILE), r#"{"mode":"full"}"#).unwrap();
        fs::write(dirs.data.join(PENDING_MARKER), b"pending").unwrap();
        fs::write(dirs.data.join(sandbox::FLAG_FILE), b"1").unwrap();

        apply_pending_full_restore(&dirs.data, &dirs.config, None);

        assert_eq!(fs::read(dirs.config.join("zettel-sandbox.db")).unwrap(), b"restored");
        assert!(!dirs.config.join("zettel.db").exists());
    }

    #[test]
    fn mode_file_staged_without_a_target_keeps_its_partial_mode() {
        let dirs = AppDirs::new("legacy-mode-file");
        let legacy =
            r#"{"mode":"partial","sections":{"customers":true,"invoices":false,"settings":false}}"#;
        fs::write(dirs.data.join(RESTORE_MODE_FILE), legacy).unwrap();

        let staged = read_staged_restore(&dirs.data);

        let expected = StagedRestore { mode: partial(sections(true, false, false)), target_db: None };
        assert_eq!(staged, expected);
    }

    #[test]
    fn placing_a_missing_staged_db_keeps_the_live_db_in_place() {
        let dir = TempDir::new("place-db-failure");
        let live = dir.path().join("zettel.db");
        fs::write(&live, b"live").unwrap();

        let result = place_restored_db(&dir.path().join("missing.db"), &live);

        assert!(result.is_err());
        assert_eq!(fs::read(&live).unwrap(), b"live");
        assert!(!live.with_extension("db.bak").exists());
    }

    #[test]
    fn partial_restore_writes_into_the_db_recorded_at_staging() {
        let dirs = AppDirs::new("partial-tenant");
        let default_db = dirs.config.join("zettel.db");
        create_db(&default_db, "default");
        let tenant_db = dirs.root.path().join("tenant.db");
        create_db(&tenant_db, "live");
        let pending = dirs.stage(partial(sections(true, false, false)), Some(tenant_db.clone()));
        create_db(&pending.join(DB_ENTRY), "backup");

        apply_partial_restore(&dirs.data, &dirs.config, None).unwrap();

        assert_eq!(tag_of(&tenant_db, "customers"), "backup");
        assert_eq!(tag_of(&tenant_db, "invoices"), "live");
        assert_eq!(tag_of(&default_db, "customers"), "default");
        assert!(!pending.exists());
    }

    #[test]
    fn failed_partial_restore_removes_the_staged_files() {
        let dirs = AppDirs::new("partial-failure");
        let live = dirs.config.join("zettel.db");
        create_db(&live, "live");
        let pending = dirs.stage(partial(sections(true, false, true)), Some(live.clone()));
        open_current_db(&pending.join(DB_ENTRY))
            .execute_batch("CREATE TABLE customers (id INTEGER PRIMARY KEY, tag TEXT);")
            .unwrap();

        let result = apply_partial_restore(&dirs.data, &dirs.config, None);

        assert!(result.is_err());
        assert_eq!(tag_of(&live, "customers"), "live");
        assert!(!pending.exists());
        assert!(!dirs.data.join(PENDING_MARKER).exists());
        assert!(!dirs.data.join(RESTORE_MODE_FILE).exists());
    }

    #[test]
    fn partial_restore_refuses_and_keeps_a_staged_full_restore() {
        let dirs = AppDirs::new("partial-on-full");
        let pending = dirs.stage(RestoreMode::Full, Some(dirs.config.join("zettel.db")));

        let err = apply_partial_restore(&dirs.data, &dirs.config, None).unwrap_err();

        assert!(err.contains("App neu starten"), "{err}");
        assert!(pending.is_dir());
        assert!(dirs.data.join(PENDING_MARKER).exists());
    }

    #[test]
    fn pdf_copy_continues_past_a_file_that_cannot_be_written() {
        let dir = TempDir::new("pdf-copy-failure");
        let (staged, documents) = (dir.path().join("staged"), dir.path().join("documents"));
        fs::create_dir_all(staged.join("Rechnungen")).unwrap();
        fs::write(staged.join("Rechnungen/a.pdf"), b"blocked").unwrap();
        fs::write(staged.join("Rechnungen/b.pdf"), b"copied").unwrap();
        fs::create_dir_all(documents.join("Rechnungen/a.pdf")).unwrap();

        let err = copy_pdf_dirs(&staged, &documents).unwrap_err();

        assert!(err.contains("a.pdf"), "{err}");
        assert_eq!(fs::read(documents.join("Rechnungen/b.pdf")).unwrap(), b"copied");
    }

    #[test]
    fn full_restore_leaves_a_pending_partial_restore_alone() {
        let dirs = AppDirs::new("partial-pending");
        let pending = dirs.stage(partial(sections(true, false, false)), None);

        apply_pending_full_restore(&dirs.data, &dirs.config, None);

        assert!(dirs.data.join(PENDING_MARKER).exists());
        assert!(pending.is_dir());
    }
}
