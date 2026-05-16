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
