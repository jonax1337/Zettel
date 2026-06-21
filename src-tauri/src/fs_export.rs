//! Schmaler File-Write-Befehl für CSV-Exporte (DATEV u. a.).
//!
//! Der vom Save-Dialog gewählte Pfad wird hier in einem Tauri-Command
//! validiert und die Datei mit UTF-8-Inhalt geschrieben — wir vermeiden so
//! `@tauri-apps/plugin-fs` plus zusätzliche Permission-Allowlist im
//! `capabilities/default.json`.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[tauri::command]
pub async fn save_text_file(path: String, content: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    let parent = target
        .parent()
        .ok_or_else(|| format!("Invalid path (no parent): {}", path))?;
    if !parent.exists() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&target, content).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
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
    let src = PathBuf::from(&src_path);
    if !src.is_file() {
        return Err(format!("Quelldatei nicht gefunden: {}", src_path));
    }
    let home = dirs::document_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Kein Documents-Verzeichnis ermittelbar.".to_string())?;
    let mut dest_dir = home.join("Zettel").join("Eingangsrechnungen");
    if let Some(slug) = vendor_slug.filter(|s| !s.trim().is_empty()) {
        dest_dir = dest_dir.join(sanitize_segment(&slug));
    }
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("eingangsrechnung");
    let ext = src
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("pdf");
    let safe_stem = sanitize_segment(stem);

    let mut dest = dest_dir.join(format!("{}.{}", safe_stem, ext));
    let mut n = 2u32;
    while dest.exists() {
        dest = dest_dir.join(format!("{}-{}.{}", safe_stem, n, ext));
        n += 1;
    }
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[derive(serde::Serialize)]
pub struct PdfVersion {
    pub path: String,
    #[serde(rename = "modifiedUnix")]
    pub modified_unix: u64,
    pub current: bool,
}

fn file_mtime(p: &Path) -> u64 {
    p.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Archive an existing generated PDF before it gets overwritten, so every
/// generation is preserved (audit trail for invoices paid in steps). Moves
/// `<dir>/<name>.pdf` to `<dir>/Versionen/<name>__<mtime_epoch>.pdf`. Returns
/// the archived path, or None if there was nothing to archive.
#[tauri::command]
pub async fn archive_pdf_version(path: String) -> Result<Option<String>, String> {
    let src = PathBuf::from(&path);
    if !src.is_file() {
        return Ok(None);
    }
    let dir = src
        .parent()
        .ok_or_else(|| format!("Kein übergeordneter Ordner: {}", path))?;
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("rechnung");
    let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("pdf");
    let mtime = file_mtime(&src);
    let versions_dir = dir.join("Versionen");
    std::fs::create_dir_all(&versions_dir).map_err(|e| e.to_string())?;
    let mut dest = versions_dir.join(format!("{}__{}.{}", stem, mtime, ext));
    let mut n = 2u32;
    while dest.exists() {
        dest = versions_dir.join(format!("{}__{}-{}.{}", stem, mtime, n, ext));
        n += 1;
    }
    std::fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    Ok(Some(dest.to_string_lossy().into_owned()))
}

/// List all preserved versions of a generated PDF (current + archived),
/// newest first. `path` is the canonical `<dir>/<name>.pdf`.
#[tauri::command]
pub async fn list_pdf_versions(path: String) -> Result<Vec<PdfVersion>, String> {
    let src = PathBuf::from(&path);
    let dir = src
        .parent()
        .ok_or_else(|| format!("Kein übergeordneter Ordner: {}", path))?;
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let mut out: Vec<PdfVersion> = Vec::new();
    if src.is_file() {
        out.push(PdfVersion {
            path: src.to_string_lossy().into_owned(),
            modified_unix: file_mtime(&src),
            current: true,
        });
    }
    let versions_dir = dir.join("Versionen");
    let prefix = format!("{}__", stem);
    if !stem.is_empty() {
        if let Ok(entries) = std::fs::read_dir(&versions_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if !p.is_file() {
                    continue;
                }
                let name = match p.file_name().and_then(|s| s.to_str()) {
                    Some(n) => n,
                    None => continue,
                };
                if name.starts_with(&prefix) && name.to_lowercase().ends_with(".pdf") {
                    out.push(PdfVersion {
                        path: p.to_string_lossy().into_owned(),
                        modified_unix: file_mtime(&p),
                        current: false,
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| b.modified_unix.cmp(&a.modified_unix));
    Ok(out)
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
