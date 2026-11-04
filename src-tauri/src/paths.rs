//! App-data, app-config and documents locations shared by backup, sandbox
//! and tenants.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Must match `tauri.conf.json:identifier`. Hardcoded so the pre-builder
/// startup steps work without an AppHandle.
const APP_IDENTIFIER: &str = "digital.laux.zettel";

pub const DOCUMENTS_SUBDIR: &str = "Zettel";
const FALLBACK_DOCUMENTS_DIR: &str = "Documents";

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

/// The user's documents folder. On Windows this is the Known Folder, which
/// follows a OneDrive redirection that `~/Documents` would miss. Linux
/// without XDG user dirs has none, so `~/Documents` stands in.
pub fn documents_dir() -> Option<PathBuf> {
    dirs::document_dir().or_else(|| dirs::home_dir().map(|home| home.join(FALLBACK_DOCUMENTS_DIR)))
}
