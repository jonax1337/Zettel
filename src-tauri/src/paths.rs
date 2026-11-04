//! App-data, app-config and documents locations shared by backup, sandbox
//! and tenants.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Must match `tauri.conf.json:identifier`. Hardcoded so the pre-builder
/// startup steps work without an AppHandle.
const APP_IDENTIFIER: &str = "digital.laux.zettel";

pub const DOCUMENTS_SUBDIR: &str = "Zettel";

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Resolve the app-data dir without an AppHandle, for use during early
/// startup (before the Tauri builder has a chance to initialize plugins).
pub fn app_data_dir_static() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join(APP_IDENTIFIER))
}

/// tauri-plugin-sql resolves relative `sqlite:` URLs against this dir, which
/// differs from the app-data dir on Linux.
pub fn app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

pub fn app_config_dir_static() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join(APP_IDENTIFIER))
}

pub fn documents_zettel_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let documents = app.path().document_dir().map_err(|e| e.to_string())?;
    Ok(documents.join(DOCUMENTS_SUBDIR))
}

pub fn documents_zettel_dir_static() -> Option<PathBuf> {
    dirs::document_dir().map(|d| d.join(DOCUMENTS_SUBDIR))
}
