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

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::fs_export::sanitize_segment;
use crate::paths::{app_data_dir, app_data_dir_static, documents_dir, DOCUMENTS_SUBDIR};
use crate::sandbox;

const CONFIG_FILE: &str = "tenants.json";
pub const DEFAULT_DB_URL: &str = "sqlite:zettel.db";
pub const SANDBOX_DB_URL: &str = "sqlite:zettel-sandbox.db";
const DEFAULT_ID: &str = "default";
const DEFAULT_LABEL: &str = "Standard";
const RELOCATED_DEFAULT_LABEL: &str = "Cloud-DB";
/// Same folder as `cli/zettel.py` uses for sandbox PDFs.
const SANDBOX_DOCUMENTS_SUBDIR: &str = "Zettel-Sandbox";
const TENANT_DOCUMENTS_SUBDIR: &str = "Mandanten";

#[derive(Serialize, Deserialize, Clone, Default)]
struct TenantConfig {
    #[serde(default)]
    active: Option<String>,
    #[serde(default)]
    tenants: Vec<Tenant>,
}

impl TenantConfig {
    /// The active tenant if it is a custom one with a usable DB path.
    fn active_custom_tenant(&self) -> Option<&Tenant> {
        let active = self.active.as_deref().filter(|id| *id != DEFAULT_ID)?;
        self.tenants
            .iter()
            .find(|t| t.id == active && !t.path.trim().is_empty())
    }

    fn push_tenant(&mut self, label: String, path: String) -> String {
        let id = format!("t{}", now_millis());
        self.tenants.push(Tenant {
            id: id.clone(),
            label,
            path,
        });
        id
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct Tenant {
    id: String,
    label: String,
    /// Absoluter Pfad zur `.db`-Datei.
    path: String,
}

/// Fehlende Datei = leere Konfiguration. Eine defekte Datei ist ein Fehler,
/// damit ein Schreibvorgang nicht still alle Tenants überschreibt.
fn load_config(dir: &Path) -> Result<TenantConfig, String> {
    match fs::read_to_string(dir.join(CONFIG_FILE)) {
        Ok(json) => {
            serde_json::from_str(&json).map_err(|e| format!("{CONFIG_FILE} ist unlesbar: {e}"))
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(TenantConfig::default()),
        Err(e) => Err(format!("{CONFIG_FILE} nicht lesbar: {e}")),
    }
}

/// Für lesende Pfade (DB-Auswahl beim Start), die auch mit defekter
/// Konfiguration auf den Standard zurückfallen müssen.
fn load_config_or_default(dir: &Path) -> TenantConfig {
    load_config(dir).unwrap_or_else(|e| {
        eprintln!("[tenants] {e}; using default");
        TenantConfig::default()
    })
}

fn write_config(dir: &Path, cfg: &TenantConfig) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(dir.join(CONFIG_FILE), json).map_err(|e| e.to_string())
}

/// Lädt die Konfiguration, wendet `change` an und speichert sie nur bei Erfolg.
fn update_config<T>(
    app: &AppHandle,
    change: impl FnOnce(&mut TenantConfig) -> Result<T, String>,
) -> Result<T, String> {
    let dir = app_data_dir(app)?;
    let mut cfg = load_config(&dir)?;
    let result = change(&mut cfg)?;
    write_config(&dir, &cfg)?;
    Ok(result)
}

fn db_url_for_path(path: &str) -> String {
    format!("sqlite:{path}")
}

enum ActiveDb {
    Default,
    Sandbox,
    Custom(Tenant),
}

/// Sandbox hat Vorrang vor dem aktiven Tenant.
fn resolve_active(dir: &Path) -> ActiveDb {
    if dir.join(sandbox::FLAG_FILE).exists() {
        return ActiveDb::Sandbox;
    }
    load_config_or_default(dir)
        .active_custom_tenant()
        .cloned()
        .map_or(ActiveDb::Default, ActiveDb::Custom)
}

/// Aktive DB-URL inkl. Sandbox-Vorrang — Quelle der Wahrheit für `client.ts`.
fn resolve_active_url(dir: &Path) -> String {
    match resolve_active(dir) {
        ActiveDb::Default => DEFAULT_DB_URL.to_string(),
        ActiveDb::Sandbox => SANDBOX_DB_URL.to_string(),
        ActiveDb::Custom(tenant) => db_url_for_path(&tenant.path),
    }
}

/// Folder below `documents_dir` for the active DB's PDFs and backups. Every
/// DB numbers its documents independently, so sandbox and custom tenants get
/// folders of their own; a shared one would let them overwrite each other's
/// PDFs (and archive them as versions of the wrong document).
pub fn active_documents_root(data_dir: &Path, documents_dir: &Path) -> PathBuf {
    let production_root = documents_dir.join(DOCUMENTS_SUBDIR);
    match resolve_active(data_dir) {
        ActiveDb::Default => production_root,
        ActiveDb::Sandbox => documents_dir.join(SANDBOX_DOCUMENTS_SUBDIR),
        ActiveDb::Custom(tenant) => production_root
            .join(TENANT_DOCUMENTS_SUBDIR)
            .join(sanitize_segment(&tenant.id)),
    }
}

pub fn active_documents_root_for(app: &AppHandle) -> Result<PathBuf, String> {
    let documents = documents_dir().ok_or("Kein Dokumente-Ordner ermittelbar.")?;
    Ok(active_documents_root(&app_data_dir(app)?, &documents))
}

/// Single source for where the frontend writes PDFs, matching what backups
/// collect.
#[tauri::command]
pub async fn get_documents_root(app: AppHandle) -> Result<String, String> {
    Ok(active_documents_root_for(&app)?.to_string_lossy().into_owned())
}

/// Datei, die das SQL-Plugin für die aktive DB öffnet. Spiegelt dessen
/// `path_mapper`: der Teil nach `sqlite:` wird an `config_dir` angehängt,
/// ein absoluter Tenant-Pfad ersetzt ihn also.
pub fn active_db_file(data_dir: &Path, config_dir: &Path) -> PathBuf {
    let url = resolve_active_url(data_dir);
    let file = url.split_once(':').map_or(url.as_str(), |(_, file)| file);
    config_dir.join(file)
}

/// Custom-Tenant-URL, für die beim Start zusätzlich Migrationen registriert
/// werden müssen (Default + Sandbox sind in `lib.rs` ohnehin registriert).
/// `None`, wenn der aktive Tenant der eingebaute Standard ist.
pub fn active_custom_db_url_static() -> Option<String> {
    let dir = app_data_dir_static()?;
    load_config_or_default(&dir)
        .active_custom_tenant()
        .map(|t| db_url_for_path(&t.path))
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
    let cfg = load_config_or_default(&app_data_dir(&app)?);
    Ok(tenant_entries(cfg))
}

fn tenant_entries(cfg: TenantConfig) -> Vec<TenantEntry> {
    let active = cfg.active.unwrap_or_else(|| DEFAULT_ID.to_string());
    let default_entry = TenantEntry {
        id: DEFAULT_ID.to_string(),
        label: DEFAULT_LABEL.to_string(),
        path: String::new(),
        current: active == DEFAULT_ID,
    };
    let custom_entries = cfg.tenants.into_iter().map(|t| TenantEntry {
        current: active == t.id,
        id: t.id,
        label: t.label,
        path: t.path,
    });
    std::iter::once(default_entry).chain(custom_entries).collect()
}

#[tauri::command]
pub async fn add_tenant(app: AppHandle, label: String, path: String) -> Result<String, String> {
    update_config(&app, |cfg| add(cfg, &label, &path))
}

fn add(cfg: &mut TenantConfig, label: &str, path: &str) -> Result<String, String> {
    let label = label.trim();
    let path = path.trim();
    if label.is_empty() {
        return Err("Bezeichnung darf nicht leer sein.".into());
    }
    if path.is_empty() {
        return Err("Kein Datenbank-Pfad gewählt.".into());
    }
    if cfg.tenants.iter().any(|t| t.path == path) {
        return Err("Für diesen Pfad existiert bereits ein Tenant.".into());
    }
    Ok(cfg.push_tenant(label.to_string(), path.to_string()))
}

#[tauri::command]
pub async fn set_active_tenant(app: AppHandle, id: String) -> Result<(), String> {
    update_config(&app, |cfg| set_active(cfg, id))
}

fn set_active(cfg: &mut TenantConfig, id: String) -> Result<(), String> {
    if id == DEFAULT_ID {
        cfg.active = None;
    } else if cfg.tenants.iter().any(|t| t.id == id) {
        cfg.active = Some(id);
    } else {
        return Err("Unbekannter Tenant.".into());
    }
    Ok(())
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
    ensure_sandbox_inactive(&app_data_dir(&app)?)?;
    update_config(&app, |cfg| relocate(cfg, &path, &label))
}

/// In the sandbox the open DB is the sandbox DB, so "moving the active DB"
/// would turn sandbox data into the real tenant.
fn ensure_sandbox_inactive(data_dir: &Path) -> Result<(), String> {
    if data_dir.join(sandbox::FLAG_FILE).exists() {
        return Err(
            "Im Sandbox-Modus kann die Datenbank nicht verschoben werden. Bitte zuerst die Sandbox verlassen."
                .into(),
        );
    }
    Ok(())
}

fn relocate(cfg: &mut TenantConfig, path: &str, label: &str) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Kein Zielpfad.".into());
    }
    let label = label.trim();

    match cfg.active.clone().filter(|id| id != DEFAULT_ID) {
        Some(active) => {
            let tenant = cfg
                .tenants
                .iter_mut()
                .find(|t| t.id == active)
                .ok_or_else(|| "Aktiver Tenant nicht gefunden.".to_string())?;
            tenant.path = path.to_string();
            if !label.is_empty() {
                tenant.label = label.to_string();
            }
        }
        None => {
            let label = if label.is_empty() { RELOCATED_DEFAULT_LABEL } else { label };
            cfg.active = Some(cfg.push_tenant(label.to_string(), path.to_string()));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn remove_tenant(app: AppHandle, id: String) -> Result<(), String> {
    update_config(&app, |cfg| remove(cfg, &id))
}

fn remove(cfg: &mut TenantConfig, id: &str) -> Result<(), String> {
    if id == DEFAULT_ID {
        return Err("Standard-Tenant kann nicht entfernt werden.".into());
    }
    cfg.tenants.retain(|t| t.id != id);
    if cfg.active.as_deref() == Some(id) {
        cfg.active = None;
    }
    Ok(())
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::TempDir;

    fn config_with_active_custom_tenant() -> TenantConfig {
        let mut cfg = TenantConfig::default();
        let id = add(&mut cfg, "Cloud", "D:/cloud/zettel.db").unwrap();
        cfg.active = Some(id);
        cfg
    }

    #[test]
    fn active_url_is_default_without_config() {
        let dir = TempDir::new("tenants-default");
        assert_eq!(resolve_active_url(dir.path()), DEFAULT_DB_URL);
    }

    #[test]
    fn active_url_uses_the_active_custom_tenant() {
        let dir = TempDir::new("tenants-custom");
        write_config(dir.path(), &config_with_active_custom_tenant()).unwrap();
        assert_eq!(resolve_active_url(dir.path()), "sqlite:D:/cloud/zettel.db");
    }

    #[test]
    fn sandbox_takes_precedence_over_the_active_tenant() {
        let dir = TempDir::new("tenants-sandbox");
        write_config(dir.path(), &config_with_active_custom_tenant()).unwrap();
        fs::write(dir.path().join(sandbox::FLAG_FILE), b"1").unwrap();
        assert_eq!(resolve_active_url(dir.path()), SANDBOX_DB_URL);
    }

    #[test]
    fn active_db_file_resolves_built_in_dbs_against_the_config_dir() {
        let (data, config) = (TempDir::new("tenants-data"), TempDir::new("tenants-config"));
        assert_eq!(
            active_db_file(data.path(), config.path()),
            config.path().join("zettel.db")
        );
        fs::write(data.path().join(sandbox::FLAG_FILE), b"1").unwrap();
        assert_eq!(
            active_db_file(data.path(), config.path()),
            config.path().join("zettel-sandbox.db")
        );
    }

    #[test]
    fn active_db_file_is_the_absolute_path_of_a_custom_tenant() {
        let (data, config) = (TempDir::new("tenants-data"), TempDir::new("tenants-config"));
        let tenant_db = data.path().join("cloud").join("zettel.db");
        let mut cfg = TenantConfig::default();
        let id = add(&mut cfg, "Cloud", &tenant_db.to_string_lossy()).unwrap();
        cfg.active = Some(id);
        write_config(data.path(), &cfg).unwrap();

        assert_eq!(active_db_file(data.path(), config.path()), tenant_db);
    }

    #[test]
    fn documents_root_is_zettel_for_the_default_db() {
        let (data, documents) = (TempDir::new("docs-default"), TempDir::new("docs"));
        assert_eq!(
            active_documents_root(data.path(), documents.path()),
            documents.path().join("Zettel")
        );
    }

    #[test]
    fn documents_root_of_the_sandbox_is_separate_from_production() {
        let (data, documents) = (TempDir::new("docs-sandbox"), TempDir::new("docs"));
        write_config(data.path(), &config_with_active_custom_tenant()).unwrap();
        fs::write(data.path().join(sandbox::FLAG_FILE), b"1").unwrap();
        assert_eq!(
            active_documents_root(data.path(), documents.path()),
            documents.path().join("Zettel-Sandbox")
        );
    }

    #[test]
    fn documents_root_of_a_custom_tenant_is_its_own_folder() {
        let (data, documents) = (TempDir::new("docs-tenant"), TempDir::new("docs"));
        let cfg = config_with_active_custom_tenant();
        let id = cfg.tenants[0].id.clone();
        write_config(data.path(), &cfg).unwrap();
        assert_eq!(
            active_documents_root(data.path(), documents.path()),
            documents.path().join("Zettel").join("Mandanten").join(id)
        );
    }

    #[test]
    fn tenant_with_blank_path_falls_back_to_default() {
        let mut cfg = config_with_active_custom_tenant();
        cfg.tenants[0].path = "  ".into();
        assert!(cfg.active_custom_tenant().is_none());
    }

    #[test]
    fn corrupt_config_still_resolves_to_default_url() {
        let dir = TempDir::new("tenants-corrupt-read");
        fs::write(dir.path().join(CONFIG_FILE), "{ not json").unwrap();
        assert_eq!(resolve_active_url(dir.path()), DEFAULT_DB_URL);
    }

    #[test]
    fn corrupt_config_is_an_error_instead_of_an_empty_config() {
        let dir = TempDir::new("tenants-corrupt-write");
        fs::write(dir.path().join(CONFIG_FILE), "{ not json").unwrap();
        assert!(load_config(dir.path()).is_err());
    }

    #[test]
    fn add_rejects_blank_input_and_duplicate_paths() {
        let mut cfg = TenantConfig::default();
        assert!(add(&mut cfg, " ", "D:/a.db").is_err());
        assert!(add(&mut cfg, "A", " ").is_err());
        add(&mut cfg, "A", "D:/a.db").unwrap();
        assert!(add(&mut cfg, "B", " D:/a.db ").is_err());
    }

    #[test]
    fn set_active_switches_between_default_and_known_tenants() {
        let mut cfg = TenantConfig::default();
        let id = add(&mut cfg, "A", "D:/a.db").unwrap();
        set_active(&mut cfg, id.clone()).unwrap();
        assert_eq!(cfg.active.as_deref(), Some(id.as_str()));
        set_active(&mut cfg, DEFAULT_ID.into()).unwrap();
        assert_eq!(cfg.active, None);
        assert!(set_active(&mut cfg, "missing".into()).is_err());
    }

    #[test]
    fn relocating_is_refused_while_the_sandbox_is_active() {
        let dir = TempDir::new("tenants-relocate-sandbox");
        assert!(ensure_sandbox_inactive(dir.path()).is_ok());
        fs::write(dir.path().join(sandbox::FLAG_FILE), b"1").unwrap();
        let err = ensure_sandbox_inactive(dir.path()).unwrap_err();
        assert!(err.contains("Sandbox"), "{err}");
    }

    #[test]
    fn relocate_from_default_creates_and_activates_a_tenant() {
        let mut cfg = TenantConfig::default();
        relocate(&mut cfg, "D:/moved.db", " ").unwrap();
        let tenant = &cfg.tenants[0];
        assert_eq!(tenant.label, RELOCATED_DEFAULT_LABEL);
        assert_eq!(cfg.active.as_deref(), Some(tenant.id.as_str()));
    }

    #[test]
    fn relocate_repoints_the_active_tenant_and_keeps_label_when_blank() {
        let mut cfg = config_with_active_custom_tenant();
        relocate(&mut cfg, "E:/new.db", "").unwrap();
        assert_eq!(cfg.tenants.len(), 1);
        assert_eq!(cfg.tenants[0].path, "E:/new.db");
        assert_eq!(cfg.tenants[0].label, "Cloud");
    }

    #[test]
    fn removing_the_active_tenant_falls_back_to_default() {
        let mut cfg = config_with_active_custom_tenant();
        let id = cfg.tenants[0].id.clone();
        remove(&mut cfg, &id).unwrap();
        assert!(cfg.tenants.is_empty());
        assert_eq!(cfg.active, None);
        assert!(remove(&mut cfg, DEFAULT_ID).is_err());
    }

    #[test]
    fn entries_list_default_first_and_mark_the_active_one() {
        let cfg = config_with_active_custom_tenant();
        let entries = tenant_entries(cfg);
        assert_eq!(entries[0].id, DEFAULT_ID);
        assert!(!entries[0].current);
        assert!(entries[1].current);
    }
}
