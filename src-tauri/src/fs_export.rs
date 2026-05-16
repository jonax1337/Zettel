//! Schmaler File-Write-Befehl für CSV-Exporte (DATEV u. a.).
//!
//! Der vom Save-Dialog gewählte Pfad wird hier in einem Tauri-Command
//! validiert und die Datei mit UTF-8-Inhalt geschrieben — wir vermeiden so
//! `@tauri-apps/plugin-fs` plus zusätzliche Permission-Allowlist im
//! `capabilities/default.json`.

use std::path::PathBuf;

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
