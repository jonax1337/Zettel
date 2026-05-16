//! Sidecar bridge: spawn the Python invoice renderer, JSON over stdin/stdout.
//!
//! Two resolution modes:
//!   - **Debug builds** spawn the Python interpreter against `sidecar/main.py`
//!     in the project tree (uses the venv at `sidecar/.venv/` by default).
//!   - **Release builds** spawn the PyInstaller-frozen `zettel-sidecar(.exe)`
//!     that ships as a bundled resource at `<resource_dir>/sidecar/`.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde_json::Value;
use tauri::{AppHandle, Manager};

/// What to spawn and from where. `program` is the executable; if `script` is
/// Some, it's passed as the first argument (dev mode runs `python main.py`).
struct SidecarLaunch {
    program: PathBuf,
    script: Option<PathBuf>,
}

fn resolve_dev_python(project_root: &PathBuf) -> PathBuf {
    if let Ok(p) = std::env::var("ZETTEL_PYTHON") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    let venv = if cfg!(windows) {
        project_root.join("sidecar/.venv/Scripts/python.exe")
    } else {
        project_root.join("sidecar/.venv/bin/python")
    };
    if venv.exists() {
        return venv;
    }
    PathBuf::from("python")
}

fn dev_project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn resolve_launch(app: &AppHandle) -> Result<SidecarLaunch, String> {
    if cfg!(debug_assertions) {
        let root = dev_project_root();
        let script = root.join("sidecar/main.py");
        if !script.exists() {
            return Err(format!(
                "Sidecar script not found at {}. Did you set up the sidecar/ directory?",
                script.display()
            ));
        }
        return Ok(SidecarLaunch {
            program: resolve_dev_python(&root),
            script: Some(script),
        });
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Could not resolve resource dir: {}", e))?;
    let exe_name = if cfg!(windows) {
        "zettel-sidecar.exe"
    } else {
        "zettel-sidecar"
    };
    let exe = resource_dir.join("sidecar").join(exe_name);
    if !exe.exists() {
        return Err(format!(
            "Bundled sidecar not found at {}. Was the PyInstaller bundle built before packaging?",
            exe.display()
        ));
    }
    Ok(SidecarLaunch {
        program: exe,
        script: None,
    })
}

pub fn run_sidecar(app: &AppHandle, request: &Value) -> Result<Value, String> {
    let launch = resolve_launch(app)?;

    let mut cmd = Command::new(&launch.program);
    if let Some(script) = &launch.script {
        cmd.arg(script);
    }

    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar ({}): {}", launch.program.display(), e))?;

    {
        let stdin = child.stdin.as_mut().ok_or("No stdin handle for sidecar")?;
        let bytes = serde_json::to_vec(request)
            .map_err(|e| format!("Could not serialize request: {}", e))?;
        stdin
            .write_all(&bytes)
            .map_err(|e| format!("Could not write to sidecar stdin: {}", e))?;
    }

    let out = child
        .wait_with_output()
        .map_err(|e| format!("Sidecar wait failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();

    if stdout.trim().is_empty() {
        return Err(format!(
            "Sidecar produced no output. exit={:?}, stderr=\n{}",
            out.status.code(),
            stderr
        ));
    }

    serde_json::from_str::<Value>(stdout.trim()).map_err(|e| {
        format!(
            "Sidecar returned non-JSON. parse_error={}, stdout=\n{}\nstderr=\n{}",
            e, stdout, stderr
        )
    })
}

#[tauri::command]
pub async fn generate_invoice(app: AppHandle, payload: Value) -> Result<Value, String> {
    let request = serde_json::json!({
        "command": "generate_invoice",
        "payload": payload,
    });
    run_sidecar(&app, &request)
}

#[tauri::command]
pub async fn generate_offer(app: AppHandle, payload: Value) -> Result<Value, String> {
    let request = serde_json::json!({
        "command": "generate_offer",
        "payload": payload,
    });
    run_sidecar(&app, &request)
}

#[tauri::command]
pub async fn ping_sidecar(app: AppHandle) -> Result<Value, String> {
    let request = serde_json::json!({ "command": "ping" });
    run_sidecar(&app, &request)
}

#[tauri::command]
pub async fn extract_zugferd(app: AppHandle, pdf_path: String) -> Result<Value, String> {
    let request = serde_json::json!({
        "command": "extract_zugferd",
        "payload": { "pdfPath": pdf_path },
    });
    run_sidecar(&app, &request)
}

#[tauri::command]
pub async fn extract_text_pdf(app: AppHandle, pdf_path: String) -> Result<Value, String> {
    let request = serde_json::json!({
        "command": "extract_text_pdf",
        "payload": { "pdfPath": pdf_path },
    });
    run_sidecar(&app, &request)
}

#[tauri::command]
pub async fn generate_reminder(app: AppHandle, payload: Value) -> Result<Value, String> {
    let request = serde_json::json!({
        "command": "generate_reminder",
        "payload": payload,
    });
    run_sidecar(&app, &request)
}
