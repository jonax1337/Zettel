//! Schmaler File-Write-Befehl für CSV-Exporte (DATEV u. a.) sowie die
//! Dateiverwaltung rund um erzeugte PDFs.
//!
//! Der vom Save-Dialog gewählte Pfad wird hier in einem Tauri-Command
//! validiert und die Datei mit UTF-8-Inhalt geschrieben — wir vermeiden so
//! `@tauri-apps/plugin-fs` plus zusätzliche Permission-Allowlist im
//! `capabilities/default.json`.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::paths::DOCUMENTS_SUBDIR;

const INCOMING_INVOICES_DIR: &str = "Eingangsrechnungen";
const VERSIONS_DIR: &str = "Versionen";
/// Separates the PDF's own name from the mtime in archived file names.
const VERSION_SEPARATOR: &str = "__";
const DEFAULT_IMPORT_STEM: &str = "eingangsrechnung";
const DEFAULT_ARCHIVE_STEM: &str = "rechnung";
const DEFAULT_EXTENSION: &str = "pdf";

#[tauri::command]
pub async fn save_text_file(path: String, content: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    let parent = target
        .parent()
        .ok_or_else(|| format!("Invalid path (no parent): {path}"))?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    fs::write(&target, content).map_err(|e| e.to_string())?;
    Ok(path_string(&target))
}

/// Copy an incoming PDF into the user's Zettel/Eingangsrechnungen/ folder.
/// Returns the final destination path. On filename collisions, appends `-2`,
/// `-3`, etc. — never overwrites an existing file. `vendor_slug` is an
/// optional sub-folder for organization.
#[tauri::command]
pub async fn import_expense_pdf(
    src_path: String,
    vendor_slug: Option<String>,
) -> Result<String, String> {
    let documents = dirs::document_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Kein Documents-Verzeichnis ermittelbar.".to_string())?;
    let incoming_root = documents.join(DOCUMENTS_SUBDIR).join(INCOMING_INVOICES_DIR);
    let destination = import_pdf(Path::new(&src_path), &incoming_root, vendor_slug.as_deref())?;
    Ok(path_string(&destination))
}

fn import_pdf(src: &Path, incoming_root: &Path, vendor_slug: Option<&str>) -> Result<PathBuf, String> {
    if !src.is_file() {
        return Err(format!("Quelldatei nicht gefunden: {}", src.display()));
    }
    let vendor_dir = vendor_slug.map(sanitize_segment).filter(|s| !s.is_empty());
    let dest_dir = match vendor_dir {
        Some(vendor) => incoming_root.join(vendor),
        None => incoming_root.to_path_buf(),
    };
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .map(sanitize_segment)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_IMPORT_STEM.to_string());
    let destination = first_free_path(&dest_dir, &stem, extension_of(src));
    fs::copy(src, &destination).map_err(|e| e.to_string())?;
    Ok(destination)
}

#[derive(Serialize)]
pub struct PdfVersion {
    pub path: String,
    #[serde(rename = "modifiedUnix")]
    pub modified_unix: u64,
    pub current: bool,
}

/// Archive an existing generated PDF before it gets overwritten, so every
/// generation is preserved (audit trail for invoices paid in steps). Moves
/// `<dir>/<name>.pdf` to `<dir>/Versionen/<name>__<mtime_epoch>.pdf`. Returns
/// the archived path, or None if there was nothing to archive.
#[tauri::command]
pub async fn archive_pdf_version(path: String) -> Result<Option<String>, String> {
    let archived = archive_pdf(Path::new(&path))?;
    Ok(archived.map(|p| path_string(&p)))
}

fn archive_pdf(src: &Path) -> Result<Option<PathBuf>, String> {
    if !src.is_file() {
        return Ok(None);
    }
    let versions_dir = parent_dir(src)?.join(VERSIONS_DIR);
    fs::create_dir_all(&versions_dir).map_err(|e| e.to_string())?;

    let stem = file_stem(src).unwrap_or(DEFAULT_ARCHIVE_STEM);
    let archived_stem = format!("{stem}{VERSION_SEPARATOR}{}", file_mtime(src));
    let destination = first_free_path(&versions_dir, &archived_stem, extension_of(src));
    fs::rename(src, &destination).map_err(|e| e.to_string())?;
    Ok(Some(destination))
}

/// List all preserved versions of a generated PDF (current + archived),
/// newest first. `path` is the canonical `<dir>/<name>.pdf`.
#[tauri::command]
pub async fn list_pdf_versions(path: String) -> Result<Vec<PdfVersion>, String> {
    pdf_versions(Path::new(&path))
}

fn pdf_versions(src: &Path) -> Result<Vec<PdfVersion>, String> {
    let dir = parent_dir(src)?;
    let mut versions = Vec::new();
    if src.is_file() {
        versions.push(pdf_version(src, true));
    }
    if let Some(stem) = file_stem(src).filter(|s| !s.is_empty()) {
        versions.extend(archived_versions(&dir.join(VERSIONS_DIR), stem)?);
    }
    versions.sort_by_key(|v| std::cmp::Reverse(v.modified_unix));
    Ok(versions)
}

fn archived_versions(versions_dir: &Path, stem: &str) -> Result<Vec<PdfVersion>, String> {
    let entries = match fs::read_dir(versions_dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };
    let prefix = format!("{stem}{VERSION_SEPARATOR}");
    let versions = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| is_archived_version(path, &prefix))
        .map(|path| pdf_version(&path, false))
        .collect();
    Ok(versions)
}

fn is_archived_version(path: &Path, prefix: &str) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with(prefix) && name.to_lowercase().ends_with(".pdf"))
}

fn pdf_version(path: &Path, current: bool) -> PdfVersion {
    PdfVersion {
        path: path_string(path),
        modified_unix: file_mtime(path),
        current,
    }
}

fn file_mtime(path: &Path) -> u64 {
    path.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// `<dir>/<base>.<ext>`, or `<dir>/<base>-<n>.<ext>` for the first free `n >= 2`.
fn first_free_path(dir: &Path, base: &str, ext: &str) -> PathBuf {
    let mut candidate = dir.join(format!("{base}.{ext}"));
    let mut n = 2u32;
    while candidate.exists() {
        candidate = dir.join(format!("{base}-{n}.{ext}"));
        n += 1;
    }
    candidate
}

fn parent_dir(path: &Path) -> Result<&Path, String> {
    path.parent()
        .ok_or_else(|| format!("Kein übergeordneter Ordner: {}", path.display()))
}

fn file_stem(path: &Path) -> Option<&str> {
    path.file_stem().and_then(|s| s.to_str())
}

fn extension_of(path: &Path) -> &str {
    path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or(DEFAULT_EXTENSION)
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn sanitize_segment(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::TempDir;

    #[test]
    fn sanitize_replaces_path_separators_and_trims_dots() {
        assert_eq!(sanitize_segment(" ../Müller: GmbH? "), "_Müller_ GmbH_");
        assert_eq!(sanitize_segment(".."), "");
    }

    #[test]
    fn first_free_path_counts_up_from_two() {
        let dir = TempDir::new("free-path");
        assert_eq!(first_free_path(dir.path(), "a", "pdf"), dir.path().join("a.pdf"));
        fs::write(dir.path().join("a.pdf"), b"").unwrap();
        fs::write(dir.path().join("a-2.pdf"), b"").unwrap();
        assert_eq!(first_free_path(dir.path(), "a", "pdf"), dir.path().join("a-3.pdf"));
    }

    #[test]
    fn import_never_overwrites_and_files_under_the_vendor() {
        let dir = TempDir::new("import");
        let src = dir.path().join("Rechnung 1.pdf");
        fs::write(&src, b"first").unwrap();
        let root = dir.path().join("incoming");

        let first = import_pdf(&src, &root, Some("Acme/GmbH")).unwrap();
        let second = import_pdf(&src, &root, Some("Acme/GmbH")).unwrap();

        assert_eq!(first, root.join("Acme_GmbH").join("Rechnung 1.pdf"));
        assert_eq!(second, root.join("Acme_GmbH").join("Rechnung 1-2.pdf"));
        assert_eq!(fs::read(first).unwrap(), b"first");
    }

    #[test]
    fn import_ignores_vendor_and_stem_that_sanitize_to_nothing() {
        let dir = TempDir::new("import-empty-names");
        let src = dir.path().join("...pdf");
        fs::write(&src, b"x").unwrap();
        let root = dir.path().join("incoming");

        let destination = import_pdf(&src, &root, Some("..")).unwrap();

        assert_eq!(destination, root.join("eingangsrechnung.pdf"));
    }

    #[test]
    fn import_reports_a_missing_source() {
        let dir = TempDir::new("import-missing");
        let err = import_pdf(&dir.path().join("none.pdf"), dir.path(), None).unwrap_err();
        assert!(err.contains("Quelldatei nicht gefunden"), "{err}");
    }

    #[test]
    fn archive_moves_the_pdf_into_versions_and_numbers_collisions() {
        let dir = TempDir::new("archive");
        let pdf = dir.path().join("RE-1.pdf");

        assert_eq!(archive_pdf(&pdf).unwrap(), None);

        fs::write(&pdf, b"v1").unwrap();
        let first = archive_pdf(&pdf).unwrap().unwrap();
        assert!(!pdf.exists());
        assert_eq!(fs::read(&first).unwrap(), b"v1");
        assert_eq!(first.parent().unwrap(), dir.path().join(VERSIONS_DIR));

        fs::write(&pdf, b"v2").unwrap();
        let second = archive_pdf(&pdf).unwrap().unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read(&second).unwrap(), b"v2");
    }

    #[test]
    fn versions_list_current_and_only_matching_archived_pdfs() {
        let dir = TempDir::new("versions");
        let pdf = dir.path().join("RE-1.pdf");
        fs::write(&pdf, b"current").unwrap();
        let versions_dir = dir.path().join(VERSIONS_DIR);
        fs::create_dir_all(&versions_dir).unwrap();
        fs::write(versions_dir.join("RE-1__100.pdf"), b"old").unwrap();
        fs::write(versions_dir.join("RE-1__100.txt"), b"not a pdf").unwrap();
        fs::write(versions_dir.join("RE-2__100.pdf"), b"other invoice").unwrap();

        let versions = pdf_versions(&pdf).unwrap();

        assert_eq!(versions.len(), 2);
        assert_eq!(versions.iter().filter(|v| v.current).count(), 1);
        assert!(versions.iter().any(|v| v.path.ends_with("RE-1__100.pdf") && !v.current));
    }

    #[test]
    fn versions_are_empty_without_versions_dir_or_current_file() {
        let dir = TempDir::new("versions-empty");
        assert!(pdf_versions(&dir.path().join("RE-1.pdf")).unwrap().is_empty());
    }

    #[test]
    fn save_text_file_creates_missing_parent_directories() {
        let dir = TempDir::new("save-text");
        let target = dir.path().join("a/b/export.csv");

        let saved = tauri::async_runtime::block_on(save_text_file(
            path_string(&target),
            "x;y".into(),
        ))
        .unwrap();

        assert_eq!(saved, path_string(&target));
        assert_eq!(fs::read_to_string(&target).unwrap(), "x;y");
    }
}
