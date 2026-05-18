use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const FLAG_FILE: &str = "sandbox.flag";

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn is_sandbox(app: AppHandle) -> Result<bool, String> {
    Ok(app_data_dir(&app)?.join(FLAG_FILE).exists())
}

#[tauri::command]
pub async fn set_sandbox(app: AppHandle, enabled: bool) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(FLAG_FILE);
    if enabled {
        fs::write(&path, b"1").map_err(|e| e.to_string())?;
    } else if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
