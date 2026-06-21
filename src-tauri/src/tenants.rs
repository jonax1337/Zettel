//! Mehr-Mandanten-fähige DB-Auswahl ("Tenants").
//!
//! Erweitert den Sandbox-Mechanismus: statt nur zwischen `zettel.db` und
//! `zettel-sandbox.db` zu schalten, kann der aktive Tenant auf eine beliebige
//! `.db`-Datei zeigen (z. B. in OneDrive für Geräte-Unabhängigkeit).
//!
//! Die Migrations-Registry des SQL-Plugins ordnet Migrationen per **exaktem
//! URL-String** zu. Darum wird der aktive Custom-Pfad beim Start gelesen und
//! seine URL in `lib.rs` mitregistriert — `client.ts` lädt dieselbe URL via
//! `get_active_db_url`. Sandbox hat Vorrang vor dem aktiven Tenant.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "tenants.json";
const SANDBOX_FLAG: &str = "sandbox.flag";
const APP_IDENTIFIER: &str = "digital.laux.zettel";
const DEFAULT_DB_URL: &str = "sqlite:zettel.db";
const SANDBOX_DB_URL: &str = "sqlite:zettel-sandbox.db";
const DEFAULT_ID: &str = "default";

#[derive(Serialize, Deserialize, Clone, Default)]
struct TenantConfig {
    #[serde(default)]
    active: Option<String>,
    #[serde(default)]
    tenants: Vec<Tenant>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Tenant {
    id: String,
    label: String,
    /// Absoluter Pfad zur `.db`-Datei.
    path: String,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn app_data_dir_static() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join(APP_IDENTIFIER))
}

fn read_config_from(dir: &Path) -> TenantConfig {
    match fs::read_to_string(dir.join(CONFIG_FILE)) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => TenantConfig::default(),
    }
}

fn write_config(dir: &Path, cfg: &TenantConfig) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(dir.join(CONFIG_FILE), json).map_err(|e| e.to_string())
}

fn db_url_for_path(path: &str) -> String {
    format!("sqlite:{}", path)
}

/// Aktive DB-URL inkl. Sandbox-Vorrang — Quelle der Wahrheit für `client.ts`.
fn resolve_active_url(dir: &Path) -> String {
    if dir.join(SANDBOX_FLAG).exists() {
        return SANDBOX_DB_URL.to_string();
    }
    let cfg = read_config_from(dir);
    if let Some(active) = cfg.active.as_deref() {
        if active != DEFAULT_ID {
            if let Some(t) = cfg.tenants.iter().find(|t| t.id == active) {
                if !t.path.trim().is_empty() {
                    return db_url_for_path(&t.path);
                }
            }
        }
    }
    DEFAULT_DB_URL.to_string()
}

/// Custom-Tenant-URL, für die beim Start zusätzlich Migrationen registriert
/// werden müssen (Default + Sandbox sind in `lib.rs` ohnehin registriert).
/// `None`, wenn der aktive Tenant der eingebaute Standard ist.
pub fn active_custom_db_url_static() -> Option<String> {
    let dir = app_data_dir_static()?;
    let cfg = read_config_from(&dir);
    let active = cfg.active.as_deref()?;
    if active == DEFAULT_ID {
        return None;
    }
    let t = cfg.tenants.iter().find(|t| t.id == active)?;
    if t.path.trim().is_empty() {
        return None;
    }
    Some(db_url_for_path(&t.path))
}

#[tauri::command]
pub async fn get_active_db_url(app: AppHandle) -> Result<String, String> {
    Ok(resolve_active_url(&app_data_dir(&app)?))
}

#[derive(Serialize)]
pub struct TenantEntry {
    id: String,
    label: String,
    path: String,
    current: bool,
}

#[tauri::command]
pub async fn list_tenants(app: AppHandle) -> Result<Vec<TenantEntry>, String> {
    let dir = app_data_dir(&app)?;
    let cfg = read_config_from(&dir);
    let active = cfg.active.clone().unwrap_or_else(|| DEFAULT_ID.to_string());
    let mut out = vec![TenantEntry {
        id: DEFAULT_ID.to_string(),
        label: "Standard".to_string(),
        path: String::new(),
        current: active == DEFAULT_ID,
    }];
    for t in cfg.tenants {
        out.push(TenantEntry {
            current: active == t.id,
            id: t.id,
            label: t.label,
            path: t.path,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn add_tenant(app: AppHandle, label: String, path: String) -> Result<String, String> {
    let label = label.trim().to_string();
    let path = path.trim().to_string();
    if label.is_empty() {
        return Err("Bezeichnung darf nicht leer sein.".into());
    }
    if path.is_empty() {
        return Err("Kein Datenbank-Pfad gewählt.".into());
    }
    let dir = app_data_dir(&app)?;
    let mut cfg = read_config_from(&dir);
    if cfg.tenants.iter().any(|t| t.path == path) {
        return Err("Für diesen Pfad existiert bereits ein Tenant.".into());
    }
    let id = format!("t{}", now_millis());
    cfg.tenants.push(Tenant {
        id: id.clone(),
        label,
        path,
    });
    write_config(&dir, &cfg)?;
    Ok(id)
}

#[tauri::command]
pub async fn set_active_tenant(app: AppHandle, id: String) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    let mut cfg = read_config_from(&dir);
    if id != DEFAULT_ID && !cfg.tenants.iter().any(|t| t.id == id) {
        return Err("Unbekannter Tenant.".into());
    }
    cfg.active = if id == DEFAULT_ID { None } else { Some(id) };
    write_config(&dir, &cfg)
}

/// Repoint the **active** tenant to a new DB path. The frontend has already
/// written a consistent copy there via `VACUUM INTO`; this only updates the
/// config. For the built-in default it creates a tenant for the moved DB and
/// activates it (the original local `zettel.db` stays as a backup).
#[tauri::command]
pub async fn relocate_active_tenant(
    app: AppHandle,
    path: String,
    label: String,
) -> Result<(), String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("Kein Zielpfad.".into());
    }
    let dir = app_data_dir(&app)?;
    let mut cfg = read_config_from(&dir);
    match cfg.active.clone() {
        Some(active) if active != DEFAULT_ID => {
            let t = cfg
                .tenants
                .iter_mut()
                .find(|t| t.id == active)
                .ok_or_else(|| "Aktiver Tenant nicht gefunden.".to_string())?;
            t.path = path;
            let label = label.trim();
            if !label.is_empty() {
                t.label = label.to_string();
            }
        }
        _ => {
            let label = label.trim();
            let label = if label.is_empty() {
                "Cloud-DB".to_string()
            } else {
                label.to_string()
            };
            let id = format!("t{}", now_millis());
            cfg.tenants.push(Tenant {
                id: id.clone(),
                label,
                path,
            });
            cfg.active = Some(id);
        }
    }
    write_config(&dir, &cfg)
}

#[tauri::command]
pub async fn remove_tenant(app: AppHandle, id: String) -> Result<(), String> {
    if id == DEFAULT_ID {
        return Err("Standard-Tenant kann nicht entfernt werden.".into());
    }
    let dir = app_data_dir(&app)?;
    let mut cfg = read_config_from(&dir);
    cfg.tenants.retain(|t| t.id != id);
    if cfg.active.as_deref() == Some(id.as_str()) {
        cfg.active = None;
    }
    write_config(&dir, &cfg)
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
