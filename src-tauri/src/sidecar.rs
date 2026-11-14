//! Sidecar bridge: spawn the Python invoice renderer, JSON over stdin/stdout.
//!
//! Two resolution modes:
//!   - **Debug builds** spawn the Python interpreter against `sidecar/main.py`
//!     in the project tree (uses the venv at `sidecar/.venv/` by default).
//!   - **Release builds** spawn the PyInstaller-frozen `zettel-sidecar(.exe)`
//!     that ships as a bundled resource at `<resource_dir>/sidecar/`.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::process::{background_command, output_within, run_blocking};

/// Rendering a large invoice takes seconds; a frozen bundle's first start
/// unpacks itself, which can take far longer on a slow disk.
const SIDECAR_TIMEOUT: Duration = Duration::from_secs(120);

/// What to spawn and from where. `program` is the executable; if `script` is
/// Some, it's passed as the first argument (dev mode runs `python main.py`).
struct SidecarLaunch {
    program: PathBuf,
    script: Option<PathBuf>,
}

fn resolve_dev_python(project_root: &Path) -> PathBuf {
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
        .map_or_else(|| PathBuf::from("."), Path::to_path_buf)
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

fn run_sidecar(app: &AppHandle, request: &Value) -> Result<Value, String> {
    let launch = resolve_launch(app)?;

    let mut cmd = background_command(&launch.program);
    if let Some(script) = &launch.script {
        cmd.arg(script);
    }
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to spawn sidecar ({}): {}",
                launch.program.display(),
                e
            )
        })?;

    // Taking the handle closes stdin once the request is written, which is
    // what tells the sidecar the request is complete.
    let mut stdin = child.stdin.take().ok_or("No stdin handle for sidecar")?;
    let bytes =
        serde_json::to_vec(request).map_err(|e| format!("Could not serialize request: {e}"))?;
    stdin
        .write_all(&bytes)
        .map_err(|e| format!("Could not write to sidecar stdin: {e}"))?;
    drop(stdin);

    let out = output_within(child, SIDECAR_TIMEOUT)
        .map_err(|e| format!("Sidecar wait failed: {e}"))?
        .ok_or_else(|| {
            format!(
                "Der PDF-Dienst hat nicht innerhalb von {} Sekunden geantwortet und wurde beendet.",
                SIDECAR_TIMEOUT.as_secs()
            )
        })?;
    parse_response(
        &String::from_utf8_lossy(&out.stdout),
        &String::from_utf8_lossy(&out.stderr),
        out.status.code(),
    )
}

fn parse_response(stdout: &str, stderr: &str, exit_code: Option<i32>) -> Result<Value, String> {
    if stdout.trim().is_empty() {
        return Err(format!(
            "Sidecar produced no output. exit={exit_code:?}, stderr=\n{stderr}"
        ));
    }
    serde_json::from_str(stdout.trim()).map_err(|e| {
        format!("Sidecar returned non-JSON. parse_error={e}, stdout=\n{stdout}\nstderr=\n{stderr}")
    })
}

fn build_request(command: &str, payload: Option<Value>) -> Value {
    let mut request = json!({ "command": command });
    if let Some(payload) = payload {
        request["payload"] = payload;
    }
    request
}

fn call(app: &AppHandle, command: &str, payload: Option<Value>) -> Result<Value, String> {
    run_sidecar(app, &build_request(command, payload))
}

fn pdf_payload(pdf_path: &str) -> Option<Value> {
    Some(json!({ "pdfPath": pdf_path }))
}

/// For the async commands: the sidecar runs on a blocking thread.
async fn call_off_runtime(
    app: AppHandle,
    command: &'static str,
    payload: Option<Value>,
) -> Result<Value, String> {
    run_blocking(move || call(&app, command, payload)).await
}

#[tauri::command]
pub async fn generate_invoice(app: AppHandle, payload: Value) -> Result<Value, String> {
    call_off_runtime(app, "generate_invoice", Some(payload)).await
}

#[tauri::command]
pub async fn generate_offer(app: AppHandle, payload: Value) -> Result<Value, String> {
    call_off_runtime(app, "generate_offer", Some(payload)).await
}

#[tauri::command]
pub async fn generate_reminder(app: AppHandle, payload: Value) -> Result<Value, String> {
    call_off_runtime(app, "generate_reminder", Some(payload)).await
}

#[tauri::command]
pub async fn generate_xrechnung(app: AppHandle, payload: Value) -> Result<Value, String> {
    call_off_runtime(app, "generate_xrechnung", Some(payload)).await
}

#[tauri::command]
pub async fn extract_zugferd(app: AppHandle, pdf_path: String) -> Result<Value, String> {
    call_off_runtime(app, "extract_zugferd", pdf_payload(&pdf_path)).await
}

#[tauri::command]
pub async fn extract_text_pdf(app: AppHandle, pdf_path: String) -> Result<Value, String> {
    call_off_runtime(app, "extract_text_pdf", pdf_payload(&pdf_path)).await
}

/// Returns the raw Factur-X XML for a given PDF path, or `{found: false}`.
/// Used by `validator::validate_einvoice_pdf` to feed the KoSIT validator.
/// Blocks: call it from a blocking thread.
pub fn extract_xml_only(app: &AppHandle, pdf_path: &str) -> Result<Value, String> {
    call(app, "extract_xml_only", pdf_payload(pdf_path))
}

#[tauri::command]
pub async fn parse_bank_statement(
    app: AppHandle,
    path: String,
    format: String,
) -> Result<Value, String> {
    call_off_runtime(
        app,
        "parse_bank_statement",
        Some(json!({ "path": path, "format": format })),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_carries_command_and_payload() {
        let request = build_request("generate_invoice", Some(json!({ "id": 1 })));
        assert_eq!(
            request,
            json!({ "command": "generate_invoice", "payload": { "id": 1 } })
        );
    }

    #[test]
    fn ping_request_has_no_payload() {
        assert_eq!(build_request("ping", None), json!({ "command": "ping" }));
    }

    #[test]
    fn response_is_parsed_from_trimmed_stdout() {
        let response = parse_response("  {\"ok\": true}\n", "warning", Some(0)).unwrap();
        assert_eq!(response, json!({ "ok": true }));
    }

    #[test]
    fn empty_stdout_reports_exit_code_and_stderr() {
        let err = parse_response("\n", "boom", Some(3)).unwrap_err();
        assert!(
            err.contains("exit=Some(3)") && err.contains("boom"),
            "{err}"
        );
    }

    #[test]
    fn non_json_stdout_reports_stdout_and_stderr() {
        let err = parse_response("Traceback", "oops", Some(1)).unwrap_err();
        assert!(
            err.contains("non-JSON") && err.contains("Traceback") && err.contains("oops"),
            "{err}"
        );
    }
}
