use std::fs;
use std::io;

use tauri::AppHandle;

use crate::paths::app_data_dir;

pub const FLAG_FILE: &str = "sandbox.flag";

#[tauri::command]
pub async fn is_sandbox(app: AppHandle) -> Result<bool, String> {
    Ok(app_data_dir(&app)?.join(FLAG_FILE).exists())
}

#[tauri::command]
pub async fn set_sandbox(app: AppHandle, enabled: bool) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let flag = dir.join(FLAG_FILE);
    if enabled {
        fs::write(&flag, b"1").map_err(|e| e.to_string())
    } else {
        match fs::remove_file(&flag) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        }
    }
}
