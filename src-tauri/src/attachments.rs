//! Invoice PDF-Anhänge: file copy + sha256 hash + best-effort delete.
//!
//! Files land in `~/Documents/Zettel/Anhänge/<invoice-number>/<hash-prefix>-<filename>`.
//! Returns metadata for the frontend to persist via `addAttachment()`.
//!
//! Mirrors the pattern of `fs_export::import_expense_pdf` but additionally
//! computes the SHA-256 of the file contents (used for dedup in the DB and
//! for the destination filename prefix to avoid collisions on identical names).

use std::io::Read;
use std::path::PathBuf;

use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRef {
    pub filename: String,
    pub content_hash: String,
    pub mime_type: String,
    pub file_size: u64,
    pub stored_path: String,
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

fn guess_mime(filename: &str) -> &'static str {
    let lower = filename.to_lowercase();
    if lower.ends_with(".pdf") {
        "application/pdf"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".csv") {
        "text/csv"
    } else if lower.ends_with(".txt") {
        "text/plain"
    } else if lower.ends_with(".xml") {
        "application/xml"
    } else if lower.ends_with(".zip") {
        "application/zip"
    } else {
        "application/octet-stream"
    }
}

fn hash_file(path: &PathBuf) -> Result<(String, u64), String> {
    let mut f =
        std::fs::File::open(path).map_err(|e| format!("Kann Datei nicht öffnen: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    let mut total: u64 = 0;
    loop {
        let n = f
            .read(&mut buf)
            .map_err(|e| format!("Lesefehler: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        total += n as u64;
    }
    let hex = hasher.finalize().iter().fold(String::new(), |mut acc, b| {
        use std::fmt::Write;
        let _ = write!(acc, "{:02x}", b);
        acc
    });
    Ok((hex, total))
}

#[tauri::command]
pub async fn import_invoice_attachment(
    invoice_number: String,
    source_path: String,
    filename: String,
) -> Result<AttachmentRef, String> {
    let src = PathBuf::from(&source_path);
    if !src.is_file() {
        return Err(format!("Quelldatei nicht gefunden: {}", source_path));
    }

    let (content_hash, file_size) = hash_file(&src)?;
    let mime_type = guess_mime(&filename).to_string();

    let home = dirs::document_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Kein Documents-Verzeichnis ermittelbar.".to_string())?;
    let invoice_segment = sanitize_segment(&invoice_number);
    if invoice_segment.is_empty() {
        return Err("Rechnungsnummer ist leer.".to_string());
    }
    let dest_dir = home
        .join("Zettel")
        .join("Anhänge")
        .join(&invoice_segment);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let safe_filename = sanitize_segment(&filename);
    let prefix = &content_hash[..8.min(content_hash.len())];
    let dest = dest_dir.join(format!("{}-{}", prefix, safe_filename));

    // Hash-prefix gives near-zero collision risk; if it does collide on the
    // exact same content + name, we treat that as idempotent and skip copy.
    if !dest.exists() {
        std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    }

    Ok(AttachmentRef {
        filename: safe_filename,
        content_hash,
        mime_type,
        file_size,
        stored_path: dest.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn delete_invoice_attachment(stored_path: String) -> Result<(), String> {
    let p = PathBuf::from(&stored_path);
    if p.is_file() {
        // Best-effort: ignore "not found" but surface other errors so the UI
        // can warn the user about permission/lock issues.
        if let Err(e) = std::fs::remove_file(&p) {
            if e.kind() != std::io::ErrorKind::NotFound {
                return Err(format!("Löschen fehlgeschlagen: {}", e));
            }
        }
    }
    Ok(())
}
