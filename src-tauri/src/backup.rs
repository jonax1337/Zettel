//! Backup / Restore — bundles SQLite + generated PDFs into a single ZIP that
//! the user can stash anywhere (cloud drive, USB stick, ...) and import again
//! on a fresh installation.
//!
//! Flow:
//!   • **Create** — frontend has SQLite emit a consistent snapshot via
//!     `VACUUM INTO`; this command zips the snapshot together with the PDF
//!     folders of the active documents root (see
//!     `tenants::active_documents_root`), the PDFs the snapshot references
//!     elsewhere, and a `manifest.json`, and deletes the snapshot afterwards.
//!   • **Stage restore** — extract the ZIP into a pending directory and write
//!     a marker file plus the restore mode, the DB file and the documents
//!     root active right now (default, sandbox or custom tenant). The DB is
//!     locked while the app runs, so a full restore is applied on next startup.
//!   • **Apply pending** — called once during `run()` BEFORE the SQL plugin
//!     initializes; if the marker file exists it moves staged files into
//!     place and removes the pending dir.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::crypto;
use crate::fs_export::{pdf_versions, INCOMING_INVOICES_DIR};
use crate::paths::{
    app_config_dir, app_config_dir_static, app_data_dir, app_data_dir_static, documents_dir,
};
use crate::tenants::{self, active_documents_root_for};

/// Newest DB schema this app can restore. Must stay in sync with
/// `CURRENT_DB_SCHEMA_VERSION` in `src/lib/utils/schema-version.ts` and the
/// highest migration version in `lib.rs` (a test in `lib.rs` checks the
/// latter).
pub(crate) const CURRENT_SCHEMA: u32 = 30;

const MANIFEST_NAME: &str = "manifest.json";
const DB_ENTRY: &str = "zettel.db";
/// Tables whose `pdf_path` points at a PDF, and the folder of the documents
/// root that holds such PDFs (the same names serve as ZIP folders).
const PDF_SOURCES: [(&str, &str); 4] = [
    ("invoices", "Rechnungen"),
    ("offers", "Angebote"),
    ("reminders", "Mahnungen"),
    ("expenses", INCOMING_INVOICES_DIR),
];
const BACKUPS_DIR: &str = "Backups";
const PENDING_DIR: &str = "pending_restore";
const PENDING_MARKER: &str = "RESTORE_PENDING";
const RESTORE_MODE_FILE: &str = "restore_mode.json";
const SNAPSHOT_FILE: &str = "zettel.backup.tmp.db";
const DECRYPTED_TMP_FILE: &str = "restore_decrypted.tmp.zip";
/// Appended to the target name while a backup is being written.
const PARTIAL_BACKUP_SUFFIX: &str = ".partial";
/// SQLite's write-ahead log and its shared-memory index, named after the DB
/// file they belong to.
const SQLITE_COMPANION_SUFFIXES: [&str; 2] = ["-wal", "-shm"];
/// Error code the frontend matches on to prompt for a password.
const PASSWORD_REQUIRED: &str = "password_required";

const CUSTOMER_TABLES: [&str; 1] = ["customers"];
/// Children before their parents, so deleting in this order is FK-safe.
/// Offers point at the invoice they were converted into, payments and
/// reminders (without a declared FK) at the invoice they belong to. The seals
/// of the hash chain travel with the invoices they seal.
const INVOICE_TABLES: [&str; 9] = [
    "offer_items",
    "offers",
    "invoice_payments",
    "invoice_seals",
    "reminders",
    "invoice_items",
    "invoices",
    "recurring_invoice_items",
    "recurring_invoices",
];
const SETTINGS_TABLES: [&str; 1] = ["settings"];
/// Restorable tables created after `MIN_PARTIAL_RESTORE_SCHEMA`: a backup
/// without them simply had no rows yet.
const TABLES_NEWER_THAN_MIN_PARTIAL_SCHEMA: [&str; 2] = ["invoice_payments", "invoice_seals"];
const INVOICE_SEALS_TABLE: &str = "invoice_seals";
const SETTINGS_ROW_ID: i64 = 1;
/// `settings` columns holding the last drawn document number.
const NUMBER_COUNTER_SUFFIX: &str = "_number_counter";
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

    fn names(&self) -> Vec<&'static str> {
        [
            (self.customers, "customers"),
            (self.invoices, "invoices"),
            (self.settings, "settings"),
        ]
        .into_iter()
        .filter_map(|(selected, name)| selected.then_some(name))
        .collect()
    }
}

/// What the frontend needs to know about an applied partial restore.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialRestoreOutcome {
    /// Whether the restored invoices came with their seals. `None` when the
    /// invoice section was not restored; `Some(false)` for a backup from
    /// before the seals existed, whose invoices the next start seals anew.
    seals_from_backup: Option<bool>,
    /// Live seals whose hash is not in the backup: the invoices they sealed
    /// are gone with the restore, and so are the seals. 0 when the invoice
    /// section was not restored.
    dropped_live_seals: u32,
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
    /// Where the restored PDFs go: the documents root of that same DB, kept
    /// for the same reason. Absent in older files and when no documents
    /// folder could be resolved at staging.
    #[serde(default)]
    documents_root: Option<PathBuf>,
}

impl StagedRestore {
    fn resolve_target(&self, data_dir: &Path, config_dir: &Path) -> PathBuf {
        self.target_db
            .clone()
            .unwrap_or_else(|| tenants::active_db_file(data_dir, config_dir))
    }

    fn resolve_documents_root(
        &self,
        data_dir: &Path,
        documents_dir: Option<&Path>,
    ) -> Option<PathBuf> {
        self.documents_root.clone().or_else(|| {
            documents_dir.map(|documents| tenants::active_documents_root(data_dir, documents))
        })
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
    // Bevorzugt <Dokumente-Root der aktiven DB>/Backups/. Wenn Documents nicht
    // erreichbar ist (OneDrive offline, Known-Folder leer, OS error 2 …),
    // fallback in den App-Data-Dir — der existiert immer (App läuft ja daraus).
    let preferred = active_documents_root_for(&app).map(|d| d.join(BACKUPS_DIR));
    if let Ok(dir) = preferred {
        if fs::create_dir_all(&dir).is_ok() {
            return Ok(path_string(&dir.join(&filename)));
        }
    }
    let fallback = app_data_dir(&app)?.join(BACKUPS_DIR);
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
    let documents_root = active_documents_root_for(&app)?;

    write_backup_file(&target, &snapshot, &manifest, &documents_root, password)?;
    let _ = fs::remove_file(&snapshot);
    Ok(path_string(&target))
}

/// Writes the backup next to `target` and moves it into place only once it
/// is complete, so a failed run leaves an existing backup at `target` intact
/// (auto-backups reuse one file per weekday).
fn write_backup_file(
    target: &Path,
    snapshot: &Path,
    manifest: &BackupManifest,
    documents_root: &Path,
    password: Option<String>,
) -> Result<(), String> {
    let partial = with_suffix(target, PARTIAL_BACKUP_SUFFIX);
    let written = write_backup_zip(&partial, snapshot, manifest, documents_root)
        .and_then(|()| match password {
            Some(pw) => encrypt_file_in_place(&partial, pw),
            None => Ok(()),
        })
        .and_then(|()| fs::rename(&partial, target).map_err(|e| e.to_string()));
    if written.is_err() {
        let _ = fs::remove_file(&partial);
    }
    written
}

/// `path` with `suffix` appended to its file name (`a.db` → `a.db-wal`).
fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
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
    zip.start_file(MANIFEST_NAME, options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| e.to_string())?;

    add_file(&mut zip, DB_ENTRY, snapshot, options)?;
    for (entry_name, path) in backup_pdf_entries(snapshot, documents_root)? {
        add_file(&mut zip, &entry_name, &path, options)?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn pdf_dirs() -> impl Iterator<Item = &'static str> {
    PDF_SOURCES.into_iter().map(|(_, dir)| dir)
}

/// Every PDF the backup carries, as (ZIP entry, file): the PDF folders of
/// `documents_root`, then the PDFs (with their archived versions) that the
/// snapshot references elsewhere, e.g. written before the documents root
/// moved. Those keep their layout below their PDF folder, so a restore puts
/// them into the documents root. On a name clash the documents root wins.
fn backup_pdf_entries(
    snapshot: &Path,
    documents_root: &Path,
) -> Result<Vec<(String, PathBuf)>, String> {
    let mut entries = Vec::new();
    let mut entry_names = HashSet::new();
    let mut push = |entry_name: String, path: PathBuf| {
        if entry_names.insert(entry_name.clone()) {
            entries.push((entry_name, path));
        }
    };

    for dir in pdf_dirs() {
        let pdf_root = documents_root.join(dir);
        if !pdf_root.is_dir() {
            continue;
        }
        for (path, relative) in files_below(&pdf_root)? {
            push(zip_entry_name(dir, &relative), path);
        }
    }
    for stored in referenced_pdfs(snapshot)? {
        if stored.path.starts_with(documents_root) {
            continue;
        }
        let base = stored.folder_base();
        for path in readable_versions_outside_root(&stored.path) {
            if let Ok(relative) = path.strip_prefix(&base) {
                push(zip_entry_name(stored.dir, relative), path.clone());
            }
        }
    }
    Ok(entries)
}

/// A PDF outside the documents root and its archived versions. Those are
/// left-overs of an older root, possibly on an offline cloud drive, so an
/// unreadable one is skipped instead of failing the whole backup.
fn readable_versions_outside_root(pdf: &Path) -> Vec<PathBuf> {
    let versions = match pdf_versions(pdf) {
        Ok(versions) => versions
            .into_iter()
            .map(|v| PathBuf::from(v.path))
            .collect(),
        Err(e) => {
            eprintln!(
                "[backup] archived versions of {} unreadable, skipped: {e}",
                pdf.display()
            );
            vec![pdf.to_path_buf()]
        }
    };
    versions
        .into_iter()
        .filter(|path| match File::open(path) {
            Ok(_) => true,
            Err(e) => {
                if e.kind() != io::ErrorKind::NotFound {
                    eprintln!("[backup] {} unreadable, skipped: {e}", path.display());
                }
                false
            }
        })
        .collect()
}

fn zip_entry_name(dir: &str, relative: &Path) -> String {
    format!("{dir}/{}", relative.to_string_lossy().replace('\\', "/"))
}

/// A row's `pdf_path`, with the PDF folder of its table.
struct StoredPdf {
    table: &'static str,
    rowid: i64,
    path: PathBuf,
    dir: &'static str,
}

impl StoredPdf {
    /// The folder the PDF's layout is kept relative to in a backup: the
    /// nearest folder above it named like its PDF folder, else its parent.
    fn folder_base(&self) -> PathBuf {
        self.path
            .ancestors()
            .skip(1)
            .find(|ancestor| ancestor.file_name().is_some_and(|name| name == self.dir))
            .or_else(|| self.path.parent())
            .unwrap_or(&self.path)
            .to_path_buf()
    }

    /// Where a backup restores this PDF to below `documents_root`.
    fn restored_path(&self, documents_root: &Path) -> Option<PathBuf> {
        let relative = self.path.strip_prefix(self.folder_base()).ok()?;
        let mut restored = documents_root.join(self.dir);
        restored.extend(relative.components());
        Some(restored)
    }
}

/// Every `pdf_path` stored in the snapshot.
fn referenced_pdfs(snapshot: &Path) -> Result<Vec<StoredPdf>, String> {
    let conn = rusqlite::Connection::open_with_flags(snapshot, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("{}: {e}", snapshot.display()))?;
    stored_pdfs(&conn)
}

fn stored_pdfs(conn: &rusqlite::Connection) -> Result<Vec<StoredPdf>, String> {
    let mut pdfs = Vec::new();
    for (table, dir) in PDF_SOURCES {
        if !table_columns(conn, "main", table)?
            .iter()
            .any(|c| c == "pdf_path")
        {
            continue;
        }
        let rows = conn
            .prepare(&format!(
                "SELECT rowid, pdf_path FROM {table} WHERE pdf_path IS NOT NULL AND pdf_path <> ''"
            ))
            .and_then(|mut statement| {
                statement
                    .query_map([], |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                    })?
                    .collect::<rusqlite::Result<Vec<_>>>()
            })
            .map_err(|e| format!("{table}.pdf_path: {e}"))?;
        pdfs.extend(rows.into_iter().map(|(rowid, path)| StoredPdf {
            table,
            rowid,
            path: PathBuf::from(path),
            dir,
        }));
    }
    Ok(pdfs)
}

/// Restored rows still name the absolute PDF path of the machine or the
/// documents root the backup was made on, while the restore put the file
/// below `documents_root`. Points every row whose PDF is missing at that
/// restored copy.
fn repoint_restored_pdfs(db: &Path, documents_root: &Path) -> Result<(), String> {
    if !db.is_file() {
        return Ok(());
    }
    let conn = rusqlite::Connection::open_with_flags(db, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|e| format!("{}: {e}", db.display()))?;
    for stored in stored_pdfs(&conn)? {
        if stored.path.is_file() {
            continue;
        }
        let Some(restored) = stored.restored_path(documents_root).filter(|p| p.is_file()) else {
            continue;
        };
        conn.execute(
            &format!("UPDATE {} SET pdf_path = ?1 WHERE rowid = ?2", stored.table),
            rusqlite::params![path_string(&restored), stored.rowid],
        )
        .map_err(|e| format!("{}.pdf_path: {e}", stored.table))?;
    }
    Ok(())
}

/// Restores the PDF folders staged in `pending_root` into `documents_root`
/// and points the rows of `db` at them. Best-effort: the DB part of the
/// restore already happened, so failures are only logged.
fn restore_pdfs(pending_root: &Path, documents_root: Option<&Path>, db: &Path) {
    let Some(documents_root) = documents_root else {
        eprintln!("[backup] documents dir unavailable, PDFs not restored");
        return;
    };
    if let Err(e) = copy_pdf_dirs(pending_root, documents_root) {
        eprintln!("[backup] could not restore PDFs: {e}");
    }
    if let Err(e) = repoint_restored_pdfs(db, documents_root) {
        eprintln!("[backup] could not point restored rows at their PDFs: {e}");
    }
}

fn add_file(
    zip: &mut ZipWriter<File>,
    entry_name: &str,
    source: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    zip.start_file(entry_name, options)
        .map_err(|e| e.to_string())?;
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

/// Copies the PDF folders from `from_root` into `to_root`, overwriting files
/// that already exist. A file that cannot be copied (e.g. locked by a PDF
/// viewer) does not stop the others: the staged copies are deleted
/// afterwards, so every skipped file would be lost.
fn copy_pdf_dirs(from_root: &Path, to_root: &Path) -> Result<(), String> {
    let mut failures = Vec::new();
    for sub in pdf_dirs() {
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
        documents_root: active_documents_root_for(&app)
            .inspect_err(|e| eprintln!("[backup] documents dir unavailable at staging: {e}"))
            .ok(),
    };

    let decrypted = if is_encrypted_file(&source)? {
        Some(decrypt_to_temp(&source, password, &data_dir)?)
    } else {
        None
    };
    let zip_path = decrypted
        .as_ref()
        .map_or(source.as_path(), |tmp| tmp.0.as_path());

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
            entry
                .read_to_string(&mut content)
                .map_err(|e| e.to_string())?;
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
    let assume_full = StagedRestore {
        mode: RestoreMode::Full,
        target_db: None,
        documents_root: None,
    };
    let Ok(json) = fs::read_to_string(data_dir.join(RESTORE_MODE_FILE)) else {
        return assume_full;
    };
    serde_json::from_str(&json).unwrap_or_else(|e| {
        eprintln!("[backup] unreadable {RESTORE_MODE_FILE}, assuming full restore: {e}");
        assume_full
    })
}

/// Drops a staged restore that will not be applied, so the (possibly
/// decrypted) backup does not stay behind in the app-data dir.
#[tauri::command]
pub async fn discard_pending_restore(app: AppHandle) -> Result<(), String> {
    clear_pending(&app_data_dir(&app)?);
    Ok(())
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
    apply_pending_full_restore(&data_dir, &config_dir, documents_dir().as_deref());
}

/// `documents_dir` is the user's documents folder, only consulted when the
/// staged restore did not record a documents root.
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

    let target = staged.resolve_target(data_dir, config_dir);
    let pending_db = pending_root.join(DB_ENTRY);
    if pending_db.is_file() {
        if let Err(e) = place_restored_db(&pending_db, &target) {
            eprintln!(
                "[backup] could not place restored DB at {}: {e}",
                target.display()
            );
        }
    }
    let documents_root = staged.resolve_documents_root(data_dir, documents_dir);
    restore_pdfs(&pending_root, documents_root.as_deref(), &target);
    clear_pending(data_dir);
}

/// Moves the staged DB over the live one. The previous DB moves to `.db.bak`
/// together with its WAL and shared-memory files: left behind, SQLite would
/// replay the old WAL onto the restored DB, and without it the `.bak` would
/// miss the last committed changes. If the staged DB cannot be placed, the
/// previous files are moved back so the app does not start on an empty
/// database.
fn place_restored_db(pending_db: &Path, live_db: &Path) -> Result<(), String> {
    if let Some(parent) = live_db.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let live_files = sqlite_files(live_db);
    let backup_files = sqlite_files(&live_db.with_extension("db.bak"));
    for stale in &backup_files {
        remove_if_present(stale).map_err(|e| format!("{}: {e}", stale.display()))?;
    }
    move_present_files(&live_files, &backup_files)?;

    let placed = fs::rename(pending_db, live_db)
        .or_else(|_| fs::copy(pending_db, live_db).map(|_| ()))
        .map_err(|e| e.to_string());
    if placed.is_err() {
        if let Err(e) = move_present_files(&backup_files, &live_files) {
            eprintln!("[backup] could not move previous DB back: {e}");
        }
    }
    placed
}

/// The DB file followed by its companion files.
fn sqlite_files(db: &Path) -> Vec<PathBuf> {
    std::iter::once(db.to_path_buf())
        .chain(SQLITE_COMPANION_SUFFIXES.map(|suffix| with_suffix(db, suffix)))
        .collect()
}

/// Renames each existing `from[i]` to `to[i]`. All-or-nothing: on failure the
/// files moved so far go back.
fn move_present_files(from: &[PathBuf], to: &[PathBuf]) -> Result<(), String> {
    let mut moved = Vec::new();
    for (source, destination) in from.iter().zip(to) {
        if !source.exists() {
            continue;
        }
        if let Err(e) = fs::rename(source, destination) {
            for (source, destination) in moved {
                let _ = fs::rename(destination, source);
            }
            return Err(format!(
                "{} → {}: {e}",
                source.display(),
                destination.display()
            ));
        }
        moved.push((source, destination));
    }
    Ok(())
}

fn remove_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// Post-init partial restore. Runs after the SQL plugin opened the DB — opens a
/// second `rusqlite` connection to the same file (SQLite handles concurrent
/// connections via locks), attaches the staged backup DB, and copies only
/// the chosen sections inside a single transaction.
#[tauri::command]
pub async fn apply_pending_partial_restore(
    app: AppHandle,
) -> Result<PartialRestoreOutcome, String> {
    let data_dir = app_data_dir(&app)?;
    let config_dir = app_config_dir(&app)?;
    apply_partial_restore(&data_dir, &config_dir, documents_dir().as_deref())
}

/// Clears the staged files after every attempt, failed ones included: the
/// frontend stages again for each attempt, and a failed one must not leave
/// the (possibly decrypted) backup behind in the app-data dir.
fn apply_partial_restore(
    data_dir: &Path,
    config_dir: &Path,
    documents_dir: Option<&Path>,
) -> Result<PartialRestoreOutcome, String> {
    let pending_root = data_dir.join(PENDING_DIR);
    if !data_dir.join(PENDING_MARKER).exists() || !pending_root.is_dir() {
        return Err("Keine ausstehende Wiederherstellung gefunden.".into());
    }
    let staged = read_staged_restore(data_dir);
    let RestoreMode::Partial { sections } = staged.mode else {
        return Err("Volle Wiederherstellung — bitte App neu starten.".into());
    };

    let target = staged.resolve_target(data_dir, config_dir);
    let documents_root = staged.resolve_documents_root(data_dir, documents_dir);
    let restored =
        restore_staged_sections(&pending_root, &target, sections, documents_root.as_deref());
    clear_pending(data_dir);
    restored
}

fn restore_staged_sections(
    pending_root: &Path,
    live_db: &Path,
    sections: PartialRestoreSections,
    documents_root: Option<&Path>,
) -> Result<PartialRestoreOutcome, String> {
    let staged_db = pending_root.join(DB_ENTRY);
    if !staged_db.is_file() {
        return Err("Backup-Datenbank fehlt im pending-Ordner.".into());
    }
    let outcome = restore_sections(live_db, &staged_db, sections)?;
    if sections.invoices {
        restore_pdfs(pending_root, documents_root, live_db);
    }
    Ok(outcome)
}

/// Replaces the selected sections of `live_db` with those of `staged_db`.
/// All-or-nothing: any failure, including a reference the restored rows
/// leave dangling, rolls the transaction back.
///
/// The audit and seal-lock triggers are dropped for the copy and recreated
/// from their stored SQL before the commit: the lock triggers would abort the
/// replacement of `invoice_seals`, and the audit triggers would log every
/// copied row. The restore leaves one `restore` row in `audit_log` instead.
fn restore_sections(
    live_db: &Path,
    staged_db: &Path,
    sections: PartialRestoreSections,
) -> Result<PartialRestoreOutcome, String> {
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
    let violations_before = foreign_key_violations(&tx)?;
    let live_counters = number_counters(&tx, "main")?;
    let dropped_live_seals = if sections.invoices {
        count_live_seals_missing_from_backup(&tx)?
    } else {
        0
    };
    let triggers = drop_triggers(&tx)?;
    for table in &tables {
        tx.execute_batch(&format!("DELETE FROM main.{table};"))
            .map_err(|e| format!("{table}: {e}"))?;
    }
    // Parents before children — the reverse of the deletion order.
    for table in tables.iter().rev() {
        if TABLES_NEWER_THAN_MIN_PARTIAL_SCHEMA.contains(table)
            && table_columns(&tx, "bak", table)?.is_empty()
        {
            continue;
        }
        let columns = shared_columns(&tx, table).map_err(|e| format!("{table}: {e}"))?;
        tx.execute_batch(&format!(
            "INSERT INTO main.{table} ({columns}) SELECT {columns} FROM bak.{table};"
        ))
        .map_err(|e| format!("{table}: {e}"))?;
    }
    keep_number_counters_ahead(&tx, &live_counters, sections.invoices)?;
    ensure_no_new_dangling_references(&tx, &violations_before, &tables)?;
    let seals_from_backup = if sections.invoices {
        reset_seal_sequence(&tx)?;
        Some(!table_columns(&tx, "bak", INVOICE_SEALS_TABLE)?.is_empty())
    } else {
        None
    };
    let outcome = PartialRestoreOutcome {
        seals_from_backup,
        dropped_live_seals,
    };
    record_restore(&tx, sections, &outcome)?;
    recreate_triggers(&tx, &triggers)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(outcome)
}

/// Live seals the restore removes for good: all of them when the backup
/// predates the seals.
fn count_live_seals_missing_from_backup(conn: &rusqlite::Connection) -> Result<u32, String> {
    let backup_has_seals = !table_columns(conn, "bak", INVOICE_SEALS_TABLE)?.is_empty();
    let query = if backup_has_seals {
        "SELECT COUNT(*) FROM main.invoice_seals live
         WHERE NOT EXISTS (SELECT 1 FROM bak.invoice_seals WHERE hash = live.hash)"
    } else {
        "SELECT COUNT(*) FROM main.invoice_seals"
    };
    conn.query_row(query, [], |row| row.get(0))
        .map_err(|e| format!("{INVOICE_SEALS_TABLE}: {e}"))
}

/// The integrity check treats an AUTOINCREMENT counter above the highest seal
/// id as removed seals. The copy only ever raises the counter, so a restore
/// from an older backup has to pull it back to the restored chain.
fn reset_seal_sequence(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(&format!(
        "DELETE FROM main.sqlite_sequence WHERE name = '{INVOICE_SEALS_TABLE}';
         INSERT INTO main.sqlite_sequence (name, seq)
           SELECT '{INVOICE_SEALS_TABLE}', MAX(id) FROM main.{INVOICE_SEALS_TABLE} HAVING COUNT(*) > 0;"
    ))
    .map_err(|e| format!("{INVOICE_SEALS_TABLE}: {e}"))
}

/// `(name, CREATE TRIGGER sql)` of every trigger in `main`.
type TriggerDefinition = (String, String);

/// Drops every trigger of `main` and returns their definitions.
fn drop_triggers(conn: &rusqlite::Connection) -> Result<Vec<TriggerDefinition>, String> {
    let triggers: Vec<TriggerDefinition> = conn
        .prepare("SELECT name, sql FROM main.sqlite_master WHERE type = 'trigger'")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect()
        })
        .map_err(|e| format!("Trigger lesen: {e}"))?;
    for (name, _) in &triggers {
        conn.execute_batch(&format!(
            "DROP TRIGGER main.\"{}\";",
            name.replace('"', "\"\"")
        ))
        .map_err(|e| format!("Trigger {name} entfernen: {e}"))?;
    }
    Ok(triggers)
}

fn recreate_triggers(
    conn: &rusqlite::Connection,
    triggers: &[TriggerDefinition],
) -> Result<(), String> {
    for (name, sql) in triggers {
        conn.execute_batch(sql)
            .map_err(|e| format!("Trigger {name} wiederherstellen: {e}"))?;
    }
    Ok(())
}

/// The one `audit_log` entry a partial restore leaves; the replaced rows
/// themselves are not logged.
fn record_restore(
    conn: &rusqlite::Connection,
    sections: PartialRestoreSections,
    outcome: &PartialRestoreOutcome,
) -> Result<(), String> {
    let details = serde_json::json!({
        "sections": sections.names(),
        "seals_from_backup": outcome.seals_from_backup,
        "dropped_live_seals": outcome.dropped_live_seals,
    });
    conn.execute(
        "INSERT INTO main.audit_log (table_name, row_id, action, new_values)
         VALUES ('backup', 0, 'restore', ?1)",
        [details.to_string()],
    )
    .map_err(|e| format!("audit_log: {e}"))?;
    Ok(())
}

/// One row of `PRAGMA foreign_key_check`: table, rowid, parent table, FK id.
type ForeignKeyViolation = (String, Option<i64>, String, i64);

fn foreign_key_violations(
    conn: &rusqlite::Connection,
) -> Result<HashSet<ForeignKeyViolation>, String> {
    let mut statement = conn
        .prepare("PRAGMA main.foreign_key_check")
        .map_err(|e| e.to_string())?;
    let violations = statement
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    Ok(violations)
}

/// Violations that existed before the restore in tables it kept are the live
/// DB's own and do not block it; any other one means rows point at rows of a
/// section that was not restored. A violation in a `restored_table` always
/// counts: its rows were replaced, and a restored row reusing the rowid of a
/// deleted one would otherwise hide behind the old violation.
fn ensure_no_new_dangling_references(
    conn: &rusqlite::Connection,
    before: &HashSet<ForeignKeyViolation>,
    restored_tables: &[&str],
) -> Result<(), String> {
    let after = foreign_key_violations(conn)?;
    let mut new = after
        .iter()
        .filter(|v| restored_tables.contains(&v.0.as_str()) || !before.contains(*v));
    let Some((table, _, parent, _)) = new.next() else {
        return Ok(());
    };
    Err(format!(
        "Teil-Wiederherstellung abgebrochen: {} Verweise würden ins Leere zeigen (z. B. {table} → {parent}). Bitte die zugehörigen Bereiche gemeinsam wiederherstellen.",
        new.count() + 1
    ))
}

/// Document number counters in `schema.settings` as (column, value).
fn number_counters(
    conn: &rusqlite::Connection,
    schema: &str,
) -> Result<Vec<(String, i64)>, String> {
    let columns = table_columns(conn, schema, "settings")?;
    let mut counters = Vec::new();
    for column in columns
        .into_iter()
        .filter(|c| c.ends_with(NUMBER_COUNTER_SUFFIX))
    {
        let value: Option<i64> = conn
            .query_row(
                &format!("SELECT \"{column}\" FROM {schema}.settings WHERE id = ?1"),
                [SETTINGS_ROW_ID],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("settings.{column}: {e}"))?
            .flatten();
        counters.push((column, value.unwrap_or(0)));
    }
    Ok(counters)
}

/// A number already drawn must never be drawn again: the live counters cover
/// every number issued live (also from invoices the restore replaced), and
/// restored invoices carry numbers up to the backup's counters.
fn keep_number_counters_ahead(
    conn: &rusqlite::Connection,
    live_counters: &[(String, i64)],
    invoices_restored: bool,
) -> Result<(), String> {
    let backup_counters = if invoices_restored {
        number_counters(conn, "bak")?
    } else {
        Vec::new()
    };
    for (column, live) in live_counters {
        let backup = backup_counters
            .iter()
            .find(|(c, _)| c == column)
            .map_or(0, |(_, value)| *value);
        conn.execute(
            &format!("UPDATE main.settings SET \"{column}\" = ?1 WHERE id = ?2"),
            [(*live).max(backup), SETTINGS_ROW_ID],
        )
        .map_err(|e| format!("settings.{column}: {e}"))?;
    }
    Ok(())
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
    let backup_columns = table_columns(conn, "bak", table)?;
    let shared: Vec<String> = table_columns(conn, "main", table)?
        .into_iter()
        .filter(|column| backup_columns.contains(column))
        .map(|column| format!("\"{}\"", column.replace('"', "\"\"")))
        .collect();
    if shared.is_empty() {
        return Err("Tabelle fehlt im Backup.".into());
    }
    Ok(shared.join(", "))
}

/// Column names of `schema.table`; empty when the table does not exist.
fn table_columns(
    conn: &rusqlite::Connection,
    schema: &str,
    table: &str,
) -> Result<Vec<String>, String> {
    let read = || -> rusqlite::Result<Vec<String>> {
        conn.prepare("SELECT name FROM pragma_table_info(?1, ?2)")?
            .query_map([table, schema], |row| row.get(0))?
            .collect()
    };
    read().map_err(|e| format!("{schema}.{table}: {e}"))
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
    use std::collections::BTreeMap;

    fn all_tables() -> impl Iterator<Item = &'static str> {
        CUSTOMER_TABLES
            .into_iter()
            .chain(INVOICE_TABLES)
            .chain(SETTINGS_TABLES)
    }

    fn sections(customers: bool, invoices: bool, settings: bool) -> PartialRestoreSections {
        PartialRestoreSections {
            customers,
            invoices,
            settings,
        }
    }

    fn partial(sections: PartialRestoreSections) -> RestoreMode {
        RestoreMode::Partial { sections }
    }

    /// DB at the current schema version, as a backup snapshot would be.
    fn open_current_db(path: &Path) -> Connection {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {CURRENT_SCHEMA};"))
            .unwrap();
        conn
    }

    /// The columns of the real `audit_log` that the restore touches.
    const AUDIT_LOG_DDL: &str = "CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        row_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        new_values TEXT
    );";

    /// The columns of the real `invoice_seals` that the restore touches.
    const SEALS_DDL: &str =
        "CREATE TABLE invoice_seals (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT, hash TEXT);";

    /// DB with every restorable table holding one row tagged `tag`; its seal
    /// has the hash `<tag>-1`.
    fn create_db(path: &Path, tag: &str) {
        let conn = open_current_db(path);
        conn.execute_batch(AUDIT_LOG_DDL).unwrap();
        for table in all_tables() {
            let ddl = if table == INVOICE_SEALS_TABLE {
                SEALS_DDL.to_string()
            } else {
                format!("CREATE TABLE {table} (id INTEGER PRIMARY KEY, tag TEXT);")
            };
            conn.execute_batch(&format!(
                "{ddl} INSERT INTO {table} (tag) VALUES ('{tag}');"
            ))
            .unwrap();
        }
        conn.execute_batch(&format!(
            "UPDATE {INVOICE_SEALS_TABLE} SET hash = '{tag}-' || id;"
        ))
        .unwrap();
    }

    /// DB built by the first `count` real migrations. The stub tables of
    /// `create_db` mirror `INVOICE_TABLES`, so only these catch a restorable
    /// table the real schema no longer has.
    fn migrated_db(path: &Path, count: usize) -> Connection {
        let conn = Connection::open(path).unwrap();
        for migration in crate::build_migrations().into_iter().take(count) {
            conn.execute_batch(migration.sql).unwrap();
        }
        conn
    }

    fn seed_issued_invoice(conn: &Connection, number: &str) {
        conn.execute_batch(&format!(
            "INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme');
             INSERT INTO invoices (number, customer_id, issue_date, due_date, status)
               VALUES ('{number}', 1, 1, 2, 'sent');"
        ))
        .unwrap();
    }

    #[test]
    fn restore_sections_runs_on_the_real_schema() {
        let all_migrations = crate::build_migrations().len();
        // Schema 29 is the last one before the seals existed.
        let pre_seal_migrations = all_migrations - 1;
        let combos = [
            sections(true, false, false),
            sections(false, true, false),
            sections(false, false, true),
            sections(true, true, false),
        ];
        for (i, wanted) in combos.into_iter().enumerate() {
            for backup_migrations in [all_migrations, pre_seal_migrations] {
                let dir = TempDir::new(&format!("restore-real-{i}-{backup_migrations}"));
                let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
                seed_issued_invoice(&migrated_db(&live, all_migrations), "RE-LIVE");
                seed_issued_invoice(&migrated_db(&staged, backup_migrations), "RE-BACKUP");
                let triggers_before = trigger_sql(&live);

                let outcome = restore_sections(&live, &staged, wanted)
                    .unwrap_or_else(|e| panic!("{wanted:?} from {backup_migrations}: {e}"));

                let number: String = Connection::open(&live)
                    .unwrap()
                    .query_row("SELECT number FROM invoices", [], |row| row.get(0))
                    .unwrap();
                let expected = if wanted.invoices {
                    "RE-BACKUP"
                } else {
                    "RE-LIVE"
                };
                assert_eq!(number, expected, "{wanted:?}");
                assert_eq!(trigger_sql(&live), triggers_before, "{wanted:?}");
                let seals_expected = wanted
                    .invoices
                    .then_some(backup_migrations == all_migrations);
                assert_eq!(outcome.seals_from_backup, seals_expected, "{wanted:?}");
            }
        }
    }

    /// Replaces the seals of `path` by one per hash, in this order.
    fn set_seal_hashes(path: &Path, hashes: &[&str]) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "DELETE FROM invoice_seals; DELETE FROM sqlite_sequence WHERE name = 'invoice_seals';",
        )
        .unwrap();
        for hash in hashes {
            conn.execute(
                "INSERT INTO invoice_seals (tag, hash) VALUES ('seal', ?1)",
                [hash],
            )
            .unwrap();
        }
    }

    fn seal_sequence(path: &Path) -> Option<i64> {
        Connection::open(path)
            .unwrap()
            .query_row(
                "SELECT seq FROM sqlite_sequence WHERE name = 'invoice_seals'",
                [],
                |row| row.get(0),
            )
            .ok()
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
            Self {
                root,
                data,
                config,
                documents,
            }
        }

        /// Writes what `stage_restore` leaves behind and returns the pending dir.
        fn stage(&self, mode: RestoreMode, target_db: Option<PathBuf>) -> PathBuf {
            let pending = self.data.join(PENDING_DIR);
            fs::create_dir_all(&pending).unwrap();
            let staged = StagedRestore {
                mode,
                target_db,
                documents_root: None,
            };
            write_staged_restore(&self.data, &staged).unwrap();
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
            RestoreMode::Partial {
                sections: sections(true, false, true)
            }
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
    fn restoring_invoices_keeps_payments_reminders_and_attachments_with_their_invoices() {
        let dir = TempDir::new("restore-invoice-children");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");

        restore_sections(&live, &staged, sections(false, true, false)).unwrap();

        for table in ["invoice_payments", "reminders"] {
            assert_eq!(tag_of(&live, table), "backup", "{table}");
        }
    }

    #[test]
    fn restoring_invoices_from_a_backup_without_payments_clears_the_live_payments() {
        let dir = TempDir::new("restore-without-payments");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");
        Connection::open(&staged)
            .unwrap()
            .execute_batch("DROP TABLE invoice_payments;")
            .unwrap();

        restore_sections(&live, &staged, sections(false, true, false)).unwrap();

        let payments: i64 = Connection::open(&live)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM invoice_payments", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(payments, 0);
        assert_eq!(tag_of(&live, "invoices"), "backup");
    }

    /// Audit triggers on a few tables and the lock triggers of the real schema.
    fn add_audit_and_lock_triggers(path: &Path) {
        let mut ddl = String::new();
        for table in ["customers", "invoices", "settings"] {
            for (event, row) in [("INSERT", "NEW"), ("UPDATE", "NEW"), ("DELETE", "OLD")] {
                ddl.push_str(&format!(
                    "CREATE TRIGGER audit_{table}_{event} AFTER {event} ON {table}
                     BEGIN
                       INSERT INTO audit_log (table_name, row_id, action)
                       VALUES ('{table}', {row}.id, lower('{event}'));
                     END;"
                ));
            }
        }
        for table in ["audit_log", "invoice_seals"] {
            for event in ["UPDATE", "DELETE"] {
                ddl.push_str(&format!(
                    "CREATE TRIGGER {table}_no_{event} BEFORE {event} ON {table}
                     BEGIN SELECT RAISE(ABORT, 'locked'); END;"
                ));
            }
        }
        Connection::open(path).unwrap().execute_batch(&ddl).unwrap();
    }

    fn trigger_sql(path: &Path) -> BTreeMap<String, String> {
        let conn = Connection::open(path).unwrap();
        let mut statement = conn
            .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'")
            .unwrap();
        let triggers = statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        triggers
    }

    /// `(table_name, row_id, action, new_values)` of every `audit_log` row.
    fn audit_rows(path: &Path) -> Vec<(String, i64, String, Option<String>)> {
        let conn = Connection::open(path).unwrap();
        let mut statement = conn
            .prepare("SELECT table_name, row_id, action, new_values FROM audit_log ORDER BY id")
            .unwrap();
        let rows = statement
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        rows
    }

    fn row_count(path: &Path, table: &str) -> i64 {
        Connection::open(path)
            .unwrap()
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap()
    }

    fn restore_details(path: &Path) -> serde_json::Value {
        let (.., details) = audit_rows(path).remove(0);
        serde_json::from_str(&details.unwrap()).unwrap()
    }

    #[test]
    fn restore_passes_the_audit_and_lock_triggers_and_logs_one_restore_row() {
        let dir = TempDir::new("restore-triggers");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");
        add_audit_and_lock_triggers(&live);
        let triggers_before = trigger_sql(&live);

        let outcome = restore_sections(&live, &staged, sections(true, true, true)).unwrap();

        assert_eq!(outcome.seals_from_backup, Some(true));
        assert_eq!(tag_of(&live, "invoice_seals"), "backup");
        assert_eq!(trigger_sql(&live), triggers_before);
        let rows = audit_rows(&live);
        assert_eq!(rows.len(), 1, "{rows:?}");
        assert_eq!(
            (rows[0].0.as_str(), rows[0].1, rows[0].2.as_str()),
            ("backup", 0, "restore")
        );
        assert_eq!(
            restore_details(&live),
            serde_json::json!({
                "sections": ["customers", "invoices", "settings"],
                "seals_from_backup": true,
                "dropped_live_seals": 1
            })
        );
    }

    #[test]
    fn the_recreated_triggers_log_and_lock_again() {
        let dir = TempDir::new("restore-triggers-active");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");
        add_audit_and_lock_triggers(&live);
        restore_sections(&live, &staged, sections(true, true, false)).unwrap();

        let conn = Connection::open(&live).unwrap();
        conn.execute("INSERT INTO customers (tag) VALUES ('later')", [])
            .unwrap();
        let lock = conn.execute("DELETE FROM invoice_seals", []);

        assert!(lock.is_err());
        assert_eq!(audit_rows(&live).last().unwrap().2, "insert");
    }

    #[test]
    fn seals_stay_untouched_when_the_invoice_section_is_not_restored() {
        let dir = TempDir::new("restore-seals-untouched");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");
        add_audit_and_lock_triggers(&live);

        let outcome = restore_sections(&live, &staged, sections(true, false, false)).unwrap();

        assert_eq!(outcome.seals_from_backup, None);
        assert_eq!(tag_of(&live, "invoice_seals"), "live");
        assert_eq!(
            restore_details(&live)["seals_from_backup"],
            serde_json::Value::Null
        );
    }

    #[test]
    fn a_backup_without_seals_clears_the_live_seals_and_reports_it() {
        let dir = TempDir::new("restore-without-seals");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");
        Connection::open(&staged)
            .unwrap()
            .execute_batch("DROP TABLE invoice_seals;")
            .unwrap();
        add_audit_and_lock_triggers(&live);

        let outcome = restore_sections(&live, &staged, sections(false, true, false)).unwrap();

        assert_eq!(outcome.seals_from_backup, Some(false));
        assert_eq!(row_count(&live, "invoice_seals"), 0);
        assert_eq!(tag_of(&live, "invoices"), "backup");
        assert_eq!(
            restore_details(&live)["seals_from_backup"],
            serde_json::json!(false)
        );
    }

    /// Live seals `live_hashes`, backup seals `backup_hashes`, invoices restored.
    fn restore_invoices_with_seals(
        label: &str,
        live_hashes: &[&str],
        backup_hashes: &[&str],
    ) -> (PathBuf, PartialRestoreOutcome, TempDir) {
        let dir = TempDir::new(label);
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");
        set_seal_hashes(&live, live_hashes);
        set_seal_hashes(&staged, backup_hashes);
        add_audit_and_lock_triggers(&live);

        let outcome = restore_sections(&live, &staged, sections(false, true, false)).unwrap();
        (live, outcome, dir)
    }

    #[test]
    fn live_seals_missing_from_the_backup_are_counted_and_logged() {
        let (live, outcome, _dir) =
            restore_invoices_with_seals("restore-dropped-seals", &["a", "b", "c"], &["a"]);

        assert_eq!(outcome.dropped_live_seals, 2);
        assert_eq!(restore_details(&live)["dropped_live_seals"], 2);
        assert_eq!(row_count(&live, "invoice_seals"), 1);
    }

    #[test]
    fn nothing_is_reported_when_the_backup_holds_every_live_seal() {
        let (live, outcome, _dir) =
            restore_invoices_with_seals("restore-kept-seals", &["a", "b"], &["a", "b", "c"]);

        assert_eq!(outcome.dropped_live_seals, 0);
        assert_eq!(restore_details(&live)["dropped_live_seals"], 0);
    }

    #[test]
    fn a_backup_without_seals_drops_every_live_seal() {
        let dir = TempDir::new("restore-all-seals-dropped");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");
        set_seal_hashes(&live, &["a", "b", "c"]);
        Connection::open(&staged)
            .unwrap()
            .execute_batch("DROP TABLE invoice_seals;")
            .unwrap();

        let outcome = restore_sections(&live, &staged, sections(false, true, false)).unwrap();

        assert_eq!(outcome.dropped_live_seals, 3);
        assert_eq!(seal_sequence(&live), None);
    }

    #[test]
    fn no_seal_is_dropped_when_the_invoice_section_is_not_restored() {
        let dir = TempDir::new("restore-seals-not-dropped");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        create_db(&staged, "backup");
        set_seal_hashes(&live, &["a", "b"]);

        let outcome = restore_sections(&live, &staged, sections(true, false, false)).unwrap();

        assert_eq!(outcome.dropped_live_seals, 0);
        assert_eq!(restore_details(&live)["dropped_live_seals"], 0);
        assert_eq!(seal_sequence(&live), Some(2));
    }

    #[test]
    fn the_seal_sequence_follows_the_restored_chain_not_the_live_one() {
        let (live, _, _dir) =
            restore_invoices_with_seals("restore-seal-sequence", &["a", "b", "c"], &["a"]);

        assert_eq!(seal_sequence(&live), Some(1));
    }

    #[test]
    fn a_failed_restore_keeps_the_triggers_and_logs_nothing() {
        let dir = TempDir::new("restore-triggers-rollback");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db(&live, "live");
        open_current_db(&staged)
            .execute_batch("CREATE TABLE customers (id INTEGER PRIMARY KEY, tag TEXT);")
            .unwrap();
        add_audit_and_lock_triggers(&live);
        let triggers_before = trigger_sql(&live);

        let result = restore_sections(&live, &staged, sections(true, true, false));

        assert!(result.is_err());
        assert_eq!(trigger_sql(&live), triggers_before);
        assert!(audit_rows(&live).is_empty());
        assert_eq!(tag_of(&live, "invoice_seals"), "live");
    }

    #[test]
    fn partial_restore_reports_whether_the_seals_came_from_the_backup() {
        let dirs = AppDirs::new("partial-outcome");
        let live = dirs.config.join("zettel.db");
        create_db(&live, "live");
        let pending = dirs.stage(partial(sections(false, true, false)), Some(live));
        create_db(&pending.join(DB_ENTRY), "backup");

        let outcome = apply_partial_restore(&dirs.data, &dirs.config, None).unwrap();

        assert_eq!(
            serde_json::to_value(&outcome).unwrap(),
            serde_json::json!({ "sealsFromBackup": true, "droppedLiveSeals": 1 })
        );
    }

    /// Customers and invoices with the real foreign key between them.
    fn create_linked_db(path: &Path, customer_ids: &[i64], invoice_customer_id: i64) {
        let conn = open_current_db(path);
        conn.execute_batch(AUDIT_LOG_DDL).unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=OFF;
             CREATE TABLE customers (id INTEGER PRIMARY KEY, tag TEXT);
             CREATE TABLE invoices (id INTEGER PRIMARY KEY, tag TEXT,
               customer_id INTEGER NOT NULL REFERENCES customers(id));",
        )
        .unwrap();
        for table in INVOICE_TABLES
            .into_iter()
            .filter(|t| *t != "invoices")
            .chain(SETTINGS_TABLES)
        {
            let ddl = if table == INVOICE_SEALS_TABLE {
                SEALS_DDL.to_string()
            } else {
                format!("CREATE TABLE {table} (id INTEGER PRIMARY KEY, tag TEXT);")
            };
            conn.execute_batch(&ddl).unwrap();
        }
        for id in customer_ids {
            conn.execute("INSERT INTO customers (id, tag) VALUES (?1, 'c')", [id])
                .unwrap();
        }
        conn.execute(
            "INSERT INTO invoices (tag, customer_id) VALUES ('invoice', ?1)",
            [invoice_customer_id],
        )
        .unwrap();
    }

    #[test]
    fn restoring_invoices_whose_customer_is_missing_live_is_rolled_back() {
        let dir = TempDir::new("restore-dangling-fk");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_linked_db(&live, &[1], 1);
        create_linked_db(&staged, &[1, 2], 2);

        let err = restore_sections(&live, &staged, sections(false, true, false)).unwrap_err();

        assert!(err.contains("invoices → customers"), "{err}");
        let customer_id: i64 = Connection::open(&live)
            .unwrap()
            .query_row("SELECT customer_id FROM invoices", [], |row| row.get(0))
            .unwrap();
        assert_eq!(customer_id, 1);
    }

    #[test]
    fn restoring_customers_and_invoices_together_satisfies_the_foreign_key() {
        let dir = TempDir::new("restore-linked");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_linked_db(&live, &[1], 1);
        create_linked_db(&staged, &[1, 2], 2);

        restore_sections(&live, &staged, sections(true, true, false)).unwrap();
    }

    #[test]
    fn dangling_references_the_live_db_already_had_do_not_block_a_restore() {
        let dir = TempDir::new("restore-old-dangling");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_linked_db(&live, &[], 7);
        create_linked_db(&staged, &[], 7);

        restore_sections(&live, &staged, sections(false, false, true)).unwrap();
    }

    #[test]
    fn an_old_dangling_reference_at_the_same_rowid_does_not_hide_a_restored_one() {
        let dir = TempDir::new("restore-masked-dangling");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_linked_db(&live, &[], 7);
        create_linked_db(&staged, &[], 9);

        let err = restore_sections(&live, &staged, sections(false, true, false)).unwrap_err();

        assert!(err.contains("invoices → customers"), "{err}");
    }

    /// DB whose settings row carries an invoice counter.
    fn create_db_with_counter(path: &Path, tag: &str, invoice_counter: i64) {
        create_db(path, tag);
        Connection::open(path)
            .unwrap()
            .execute_batch(&format!(
                "ALTER TABLE settings ADD COLUMN invoice_number_counter INTEGER NOT NULL DEFAULT 0;
                 UPDATE settings SET invoice_number_counter = {invoice_counter};"
            ))
            .unwrap();
    }

    fn invoice_counter_of(path: &Path) -> i64 {
        Connection::open(path)
            .unwrap()
            .query_row("SELECT invoice_number_counter FROM settings", [], |row| {
                row.get(0)
            })
            .unwrap()
    }

    #[test]
    fn restoring_settings_keeps_the_live_counter_ahead_of_an_older_backup() {
        let dir = TempDir::new("restore-counter-settings");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db_with_counter(&live, "live", 7);
        create_db_with_counter(&staged, "backup", 3);

        restore_sections(&live, &staged, sections(false, false, true)).unwrap();

        assert_eq!(tag_of(&live, "settings"), "backup");
        assert_eq!(invoice_counter_of(&live), 7);
    }

    #[test]
    fn restoring_invoices_raises_the_counter_to_the_backups_numbers() {
        let dir = TempDir::new("restore-counter-invoices");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db_with_counter(&live, "live", 4);
        create_db_with_counter(&staged, "backup", 9);

        restore_sections(&live, &staged, sections(false, true, false)).unwrap();

        assert_eq!(invoice_counter_of(&live), 9);
    }

    #[test]
    fn restoring_invoices_never_lowers_the_counter() {
        let dir = TempDir::new("restore-counter-no-rollback");
        let (live, staged) = (dir.path().join("live.db"), dir.path().join("staged.db"));
        create_db_with_counter(&live, "live", 12);
        create_db_with_counter(&staged, "backup", 9);

        restore_sections(&live, &staged, sections(false, true, true)).unwrap();

        assert_eq!(invoice_counter_of(&live), 12);
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
            .query_row("SELECT \"vat accounting\" FROM settings", [], |row| {
                row.get(0)
            })
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
        create_snapshot(&snapshot, &[]);
        let zip_path = dir.path().join("backup.zip");

        let manifest = BackupManifest::new(CURRENT_SCHEMA, Some(1));
        write_backup_zip(&zip_path, &snapshot, &manifest, &documents).unwrap();
        let pending = dir.path().join("pending");
        extract_backup(&zip_path, &pending).unwrap();

        assert_eq!(
            fs::read(pending.join(DB_ENTRY)).unwrap(),
            fs::read(&snapshot).unwrap()
        );
        assert_eq!(
            fs::read(pending.join("Rechnungen/2026/RE-1.pdf")).unwrap(),
            b"pdf-bytes"
        );
    }

    /// Snapshot DB whose tables reference the given PDFs as (table, pdf_path).
    fn create_snapshot(path: &Path, pdf_paths: &[(&str, &Path)]) {
        let conn = open_current_db(path);
        for (table, _) in PDF_SOURCES {
            conn.execute_batch(&format!(
                "CREATE TABLE {table} (id INTEGER PRIMARY KEY, pdf_path TEXT);"
            ))
            .unwrap();
        }
        for (table, pdf) in pdf_paths {
            conn.execute(
                &format!("INSERT INTO {table} (pdf_path) VALUES (?1)"),
                [pdf.to_string_lossy()],
            )
            .unwrap();
        }
    }

    fn write_file(path: &Path, content: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn zip_entries(zip_path: &Path) -> Vec<String> {
        let mut archive = ZipArchive::new(File::open(zip_path).unwrap()).unwrap();
        (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect()
    }

    #[test]
    fn backup_and_restore_cover_reminder_and_incoming_invoice_pdfs() {
        let dir = TempDir::new("all-pdf-folders");
        let documents = dir.path().join("documents");
        for (folder, file) in [
            ("Rechnungen", "RE-1.pdf"),
            ("Angebote", "AN-1.pdf"),
            ("Mahnungen", "MA-1.pdf"),
            ("Eingangsrechnungen", "Acme/ER-1.pdf"),
        ] {
            write_file(&documents.join(folder).join(file), folder.as_bytes());
        }
        let snapshot = dir.path().join("snapshot.db");
        create_snapshot(&snapshot, &[]);
        let zip_path = dir.path().join("backup.zip");
        let manifest = BackupManifest::new(CURRENT_SCHEMA, None);

        write_backup_zip(&zip_path, &snapshot, &manifest, &documents).unwrap();
        let pending = dir.path().join("pending");
        extract_backup(&zip_path, &pending).unwrap();
        let restored = dir.path().join("restored");
        copy_pdf_dirs(&pending, &restored).unwrap();

        assert_eq!(
            fs::read(restored.join("Mahnungen/MA-1.pdf")).unwrap(),
            b"Mahnungen"
        );
        assert_eq!(
            fs::read(restored.join("Eingangsrechnungen/Acme/ER-1.pdf")).unwrap(),
            b"Eingangsrechnungen"
        );
    }

    #[test]
    fn backup_includes_referenced_pdfs_outside_the_documents_root_with_their_versions() {
        let dir = TempDir::new("legacy-pdfs");
        let legacy_invoice = dir.path().join("home/Documents/Zettel/Rechnungen/RE-1.pdf");
        write_file(&legacy_invoice, b"legacy");
        write_file(
            &dir.path()
                .join("home/Documents/Zettel/Rechnungen/Versionen/RE-1__100.pdf"),
            b"legacy-v1",
        );
        let loose_expense = dir.path().join("downloads/beleg.pdf");
        write_file(&loose_expense, b"expense");
        let snapshot = dir.path().join("snapshot.db");
        create_snapshot(
            &snapshot,
            &[("invoices", &legacy_invoice), ("expenses", &loose_expense)],
        );
        let documents_root = dir.path().join("onedrive/Dokumente/Zettel");
        let zip_path = dir.path().join("backup.zip");
        let manifest = BackupManifest::new(CURRENT_SCHEMA, None);

        write_backup_zip(&zip_path, &snapshot, &manifest, &documents_root).unwrap();
        let pending = dir.path().join("pending");
        extract_backup(&zip_path, &pending).unwrap();

        assert_eq!(
            fs::read(pending.join("Rechnungen/RE-1.pdf")).unwrap(),
            b"legacy"
        );
        assert_eq!(
            fs::read(pending.join("Rechnungen/Versionen/RE-1__100.pdf")).unwrap(),
            b"legacy-v1"
        );
        assert_eq!(
            fs::read(pending.join("Eingangsrechnungen/beleg.pdf")).unwrap(),
            b"expense"
        );
    }

    #[test]
    fn a_referenced_pdf_inside_the_documents_root_is_stored_once() {
        let dir = TempDir::new("pdf-dedup");
        let documents_root = dir.path().join("Zettel");
        let invoice = documents_root.join("Rechnungen/RE-1.pdf");
        write_file(&invoice, b"current");
        let legacy = dir.path().join("old/Zettel/Rechnungen/RE-1.pdf");
        write_file(&legacy, b"stale");
        let snapshot = dir.path().join("snapshot.db");
        create_snapshot(&snapshot, &[("invoices", &invoice), ("offers", &legacy)]);
        let zip_path = dir.path().join("backup.zip");
        let manifest = BackupManifest::new(CURRENT_SCHEMA, None);

        write_backup_zip(&zip_path, &snapshot, &manifest, &documents_root).unwrap();

        let entries = zip_entries(&zip_path);
        assert_eq!(
            entries
                .iter()
                .filter(|e| *e == "Rechnungen/RE-1.pdf")
                .count(),
            1
        );
        let pending = dir.path().join("pending");
        extract_backup(&zip_path, &pending).unwrap();
        assert_eq!(
            fs::read(pending.join("Rechnungen/RE-1.pdf")).unwrap(),
            b"current"
        );
    }

    #[test]
    fn full_restore_puts_pdfs_into_the_documents_root_recorded_at_staging() {
        let dirs = AppDirs::new("full-restore-docs-root");
        let sandbox_root = dirs.documents.join("Zettel-Sandbox");
        let pending = dirs.data.join(PENDING_DIR);
        fs::create_dir_all(pending.join("Rechnungen")).unwrap();
        fs::write(pending.join("Rechnungen/RE-1.pdf"), b"sandbox").unwrap();
        let staged = StagedRestore {
            mode: RestoreMode::Full,
            target_db: Some(dirs.config.join("zettel-sandbox.db")),
            documents_root: Some(sandbox_root.clone()),
        };
        write_staged_restore(&dirs.data, &staged).unwrap();

        apply_pending_full_restore(&dirs.data, &dirs.config, Some(&dirs.documents));

        assert_eq!(
            fs::read(sandbox_root.join("Rechnungen/RE-1.pdf")).unwrap(),
            b"sandbox"
        );
        assert!(!dirs.documents.join("Zettel/Rechnungen/RE-1.pdf").exists());
    }

    fn pdf_path_of(db: &Path, table: &str) -> PathBuf {
        Connection::open(db)
            .unwrap()
            .query_row(&format!("SELECT pdf_path FROM {table}"), [], |row| {
                row.get::<_, String>(0)
            })
            .map(PathBuf::from)
            .unwrap()
    }

    #[test]
    fn full_restore_points_rows_at_pdfs_restored_from_another_root() {
        let dirs = AppDirs::new("full-restore-repoint");
        let documents_root = dirs.documents.join("Zettel");
        let elsewhere = dirs
            .root
            .path()
            .join("old-machine/Zettel/Rechnungen/2026/RE-1.pdf");
        let still_there = dirs.root.path().join("kept/AN-1.pdf");
        write_file(&still_there, b"offer");
        let pending = dirs.stage(RestoreMode::Full, Some(dirs.config.join("zettel.db")));
        create_snapshot(
            &pending.join(DB_ENTRY),
            &[("invoices", &elsewhere), ("offers", &still_there)],
        );
        write_file(&pending.join("Rechnungen/2026/RE-1.pdf"), b"invoice");
        write_file(&pending.join("Angebote/AN-1.pdf"), b"offer");

        apply_pending_full_restore(&dirs.data, &dirs.config, Some(&dirs.documents));

        let live = dirs.config.join("zettel.db");
        let restored_invoice = documents_root.join("Rechnungen/2026/RE-1.pdf");
        assert_eq!(pdf_path_of(&live, "invoices"), restored_invoice);
        assert_eq!(fs::read(&restored_invoice).unwrap(), b"invoice");
        assert_eq!(pdf_path_of(&live, "offers"), still_there);
    }

    #[test]
    fn partial_invoice_restore_points_rows_at_the_restored_pdfs() {
        let dirs = AppDirs::new("partial-restore-repoint");
        let live = dirs.config.join("zettel.db");
        create_db(&live, "live");
        let pending = dirs.stage(partial(sections(false, true, false)), Some(live.clone()));
        let staged_db = pending.join(DB_ENTRY);
        create_db(&staged_db, "backup");
        let elsewhere = dirs.root.path().join("old/Zettel/Mahnungen/MA-1.pdf");
        Connection::open(&staged_db)
            .unwrap()
            .execute_batch(&format!(
                "ALTER TABLE reminders ADD COLUMN pdf_path TEXT;
                 UPDATE reminders SET pdf_path = '{}';",
                path_string(&elsewhere)
            ))
            .unwrap();
        Connection::open(&live)
            .unwrap()
            .execute_batch("ALTER TABLE reminders ADD COLUMN pdf_path TEXT;")
            .unwrap();
        write_file(&pending.join("Mahnungen/MA-1.pdf"), b"reminder");

        apply_partial_restore(&dirs.data, &dirs.config, Some(&dirs.documents)).unwrap();

        let restored = dirs.documents.join("Zettel/Mahnungen/MA-1.pdf");
        assert_eq!(pdf_path_of(&live, "reminders"), restored);
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
        write_zip(
            &zip_path,
            &[(MANIFEST_NAME, manifest.as_bytes()), (DB_ENTRY, b"db")],
        );

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
            let err = decrypt_to_temp(&encrypted, missing, dir.path())
                .err()
                .unwrap();
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
        assert_eq!(
            fs::read(dirs.documents.join("Zettel/Angebote/AN-1.pdf")).unwrap(),
            b"offer"
        );
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
        assert_eq!(
            fs::read(tenant_db.with_extension("db.bak")).unwrap(),
            b"tenant-old"
        );
        assert_eq!(fs::read(&default_db).unwrap(), b"default");
    }

    #[test]
    fn full_restore_targets_the_db_recorded_at_staging_even_after_a_sandbox_switch() {
        let dirs = AppDirs::new("full-restore-switch");
        let pending = dirs.stage(RestoreMode::Full, Some(dirs.config.join("zettel.db")));
        fs::write(pending.join(DB_ENTRY), b"restored").unwrap();
        fs::write(dirs.data.join(sandbox::FLAG_FILE), b"1").unwrap();

        apply_pending_full_restore(&dirs.data, &dirs.config, None);

        assert_eq!(
            fs::read(dirs.config.join("zettel.db")).unwrap(),
            b"restored"
        );
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

        assert_eq!(
            fs::read(dirs.config.join("zettel-sandbox.db")).unwrap(),
            b"restored"
        );
        assert!(!dirs.config.join("zettel.db").exists());
    }

    #[test]
    fn mode_file_staged_without_a_target_keeps_its_partial_mode() {
        let dirs = AppDirs::new("legacy-mode-file");
        let legacy =
            r#"{"mode":"partial","sections":{"customers":true,"invoices":false,"settings":false}}"#;
        fs::write(dirs.data.join(RESTORE_MODE_FILE), legacy).unwrap();

        let staged = read_staged_restore(&dirs.data);

        let expected = StagedRestore {
            mode: partial(sections(true, false, false)),
            target_db: None,
            documents_root: None,
        };
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
    fn placing_a_restored_db_moves_the_old_wal_into_the_backup_set() {
        let dir = TempDir::new("place-db-wal");
        let live = dir.path().join("zettel.db");
        let pending = dir.path().join("pending.db");
        fs::write(&live, b"live").unwrap();
        fs::write(with_suffix(&live, "-wal"), b"live-wal").unwrap();
        fs::write(with_suffix(&live, "-shm"), b"live-shm").unwrap();
        fs::write(&pending, b"restored").unwrap();

        place_restored_db(&pending, &live).unwrap();

        let backup = live.with_extension("db.bak");
        assert_eq!(fs::read(&live).unwrap(), b"restored");
        assert!(!with_suffix(&live, "-wal").exists());
        assert!(!with_suffix(&live, "-shm").exists());
        assert_eq!(fs::read(&backup).unwrap(), b"live");
        assert_eq!(fs::read(with_suffix(&backup, "-wal")).unwrap(), b"live-wal");
    }

    #[test]
    fn placing_a_restored_db_drops_the_wal_of_an_older_backup() {
        let dir = TempDir::new("place-db-stale-bak");
        let live = dir.path().join("zettel.db");
        let pending = dir.path().join("pending.db");
        let backup = live.with_extension("db.bak");
        fs::write(&live, b"live").unwrap();
        fs::write(&backup, b"older").unwrap();
        fs::write(with_suffix(&backup, "-wal"), b"older-wal").unwrap();
        fs::write(&pending, b"restored").unwrap();

        place_restored_db(&pending, &live).unwrap();

        assert_eq!(fs::read(&backup).unwrap(), b"live");
        assert!(!with_suffix(&backup, "-wal").exists());
    }

    #[test]
    fn a_restored_sqlite_db_reads_its_own_data_not_the_previous_wal() {
        let dir = TempDir::new("place-db-sqlite");
        let original = dir.path().join("original.db");
        let live = dir.path().join("zettel.db");
        let pending = dir.path().join("pending.db");
        let original_conn = Connection::open(&original).unwrap();
        original_conn
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;
                 CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('live');",
            )
            .unwrap();
        // Copied while the connection is open: what a killed app leaves behind.
        fs::copy(&original, &live).unwrap();
        fs::copy(with_suffix(&original, "-wal"), with_suffix(&live, "-wal")).unwrap();
        drop(original_conn);
        Connection::open(&pending)
            .unwrap()
            .execute_batch("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('restored');")
            .unwrap();

        place_restored_db(&pending, &live).unwrap();

        let value: String = Connection::open(&live)
            .unwrap()
            .query_row("SELECT v FROM t", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "restored");
    }

    #[test]
    fn a_failed_backup_keeps_the_previous_file_at_the_target() {
        let dir = TempDir::new("backup-atomic");
        let target = dir.path().join("auto-mon.zip");
        fs::write(&target, b"last week").unwrap();
        let manifest = BackupManifest::new(CURRENT_SCHEMA, None);

        let result = write_backup_file(
            &target,
            &dir.path().join("missing.db"),
            &manifest,
            dir.path(),
            None,
        );

        assert!(result.is_err());
        assert_eq!(fs::read(&target).unwrap(), b"last week");
        assert!(!with_suffix(&target, PARTIAL_BACKUP_SUFFIX).exists());
    }

    #[test]
    fn a_successful_backup_replaces_the_previous_file() {
        let dir = TempDir::new("backup-replace");
        let target = dir.path().join("auto-mon.zip");
        fs::write(&target, b"last week").unwrap();
        let snapshot = dir.path().join("snapshot.db");
        create_snapshot(&snapshot, &[]);
        let manifest = BackupManifest::new(CURRENT_SCHEMA, None);

        write_backup_file(&target, &snapshot, &manifest, dir.path(), None).unwrap();

        extract_backup(&target, &dir.path().join("pending")).unwrap();
        assert!(!with_suffix(&target, PARTIAL_BACKUP_SUFFIX).exists());
    }

    #[test]
    fn partial_restore_writes_into_the_db_recorded_at_staging() {
        let dirs = AppDirs::new("partial-tenant");
        let default_db = dirs.config.join("zettel.db");
        create_db(&default_db, "default");
        let tenant_db = dirs.root.path().join("tenant.db");
        create_db(&tenant_db, "live");
        let pending = dirs.stage(
            partial(sections(true, false, false)),
            Some(tenant_db.clone()),
        );
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
        assert_eq!(
            fs::read(documents.join("Rechnungen/b.pdf")).unwrap(),
            b"copied"
        );
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
