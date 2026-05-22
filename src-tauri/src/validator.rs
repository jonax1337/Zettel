//! KoSIT Validator integration. Spawns `java -jar` against the bundled
//! validator + xrechnung scenarios, parses the report XML, returns a
//! structured result the UI can render.
//!
//! Validator path resolution:
//!   1. dev:  <workspace>/tools/kosit-validator/
//!   2. prod: <appdata>/zettel/validator/   (downloaded on first use)
//!
//! The JRE itself is NOT bundled in v0.8 — we require `java` on PATH and
//! prompt the user to install it (or jlink-bundle in v0.8.x).

use crate::sidecar;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct ValidationFinding {
    pub severity: String,
    pub code: Option<String>,
    pub message: String,
    pub location: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ValidationReport {
    pub valid: bool,
    pub scenario: Option<String>,
    pub findings: Vec<ValidationFinding>,
    pub raw_report_path: String,
}

#[derive(Debug, Serialize)]
pub struct ValidatorStatus {
    pub installed: bool,
    pub validator_dir: String,
    pub has_java: bool,
    pub java_version: Option<String>,
}

fn appdata_validator_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    Ok(base.join("validator"))
}

fn workspace_validator_dir() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop();
    p.push("tools");
    p.push("kosit-validator");
    p
}

fn workspace_jre_dir() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop();
    p.push("tools");
    p.push("jre");
    p
}

fn resolve_validator_dir(app: &AppHandle) -> PathBuf {
    // Dev: workspace tools/ first if it exists. Prod: shipped resources.
    if cfg!(debug_assertions) {
        let dev = workspace_validator_dir();
        if dev.join("validator.jar").exists() {
            return dev;
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        let bundled = res.join("kosit-validator");
        if bundled.join("validator.jar").exists() {
            return bundled;
        }
    }
    appdata_validator_dir(app).unwrap_or_else(|_| PathBuf::from("validator"))
}

/// Returns the path to a Java executable. Prefers bundled JRE
/// (shipped in resources/jre/), falls back to system `java` on PATH.
fn resolve_java(app: &AppHandle) -> PathBuf {
    let exe = if cfg!(windows) { "java.exe" } else { "java" };

    if cfg!(debug_assertions) {
        let dev = workspace_jre_dir().join("bin").join(exe);
        if dev.exists() {
            return dev;
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        let bundled = res.join("jre").join("bin").join(exe);
        if bundled.exists() {
            return bundled;
        }
    }
    PathBuf::from("java")
}

fn detect_java_at(java: &Path) -> Option<String> {
    let out = Command::new(java).arg("-version").output().ok()?;
    // `java -version` writes to stderr.
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    combined.lines().next().map(|s| s.trim().to_string())
}

#[tauri::command]
pub async fn validator_status(app: AppHandle) -> Result<ValidatorStatus, String> {
    let dir = resolve_validator_dir(&app);
    let installed = dir.join("validator.jar").exists() && dir.join("scenarios.xml").exists();
    let java_path = resolve_java(&app);
    let java = detect_java_at(&java_path);
    Ok(ValidatorStatus {
        installed,
        validator_dir: dir.to_string_lossy().into_owned(),
        has_java: java.is_some(),
        java_version: java,
    })
}

#[tauri::command]
pub async fn validate_einvoice_pdf(
    app: AppHandle,
    pdf_path: String,
) -> Result<ValidationReport, String> {
    let extract = sidecar::extract_xml_only(&app, &pdf_path)?;
    let found = extract.get("found").and_then(|v| v.as_bool()).unwrap_or(false);
    if !found {
        return Err(
            "PDF enthält kein Factur-X/ZUGFeRD-XML — Validierung nicht möglich.".into(),
        );
    }
    let xml = extract
        .get("xml")
        .and_then(|v| v.as_str())
        .ok_or("Sidecar lieferte kein XML zurück.")?;

    let tmp_xml = std::env::temp_dir()
        .join(format!("zettel-validate-{}.xml", std::process::id()));
    std::fs::write(&tmp_xml, xml).map_err(|e| format!("tmp write: {}", e))?;

    let result = validate_einvoice_xml(app, tmp_xml.to_string_lossy().into_owned()).await;
    let _ = std::fs::remove_file(&tmp_xml);
    result
}

#[tauri::command]
pub async fn validate_einvoice_xml(
    app: AppHandle,
    xml_path: String,
) -> Result<ValidationReport, String> {
    let dir = resolve_validator_dir(&app);
    let jar = dir.join("validator.jar");
    let scenarios = dir.join("scenarios.xml");
    if !jar.exists() || !scenarios.exists() {
        return Err(format!(
            "Validator nicht installiert. Erwartet: {}",
            dir.display()
        ));
    }

    let input = Path::new(&xml_path);
    if !input.exists() {
        return Err(format!("Eingabedatei nicht gefunden: {}", xml_path));
    }

    let tmp = std::env::temp_dir().join("zettel-validator");
    std::fs::create_dir_all(&tmp).map_err(|e| format!("tmpdir: {}", e))?;

    let java = resolve_java(&app);
    // KoSIT prüft `FileInputStream.available()` um stdin-Pipe-Mode zu erkennen.
    // Auf Windows wirft `available()` für character devices (Console-Handle,
    // NUL) eine `IOException: Unzulässige Funktion` — `Stdio::null()` reicht
    // also nicht. Wir reichen eine leere reguläre Datei rein: disk-type ist
    // pollbar, `available()` liefert sauber 0, `isPiped()` wird false.
    let empty_stdin = tmp.join("empty-stdin");
    std::fs::write(&empty_stdin, b"").map_err(|e| format!("empty stdin write: {}", e))?;
    let stdin_file =
        std::fs::File::open(&empty_stdin).map_err(|e| format!("empty stdin open: {}", e))?;
    let output = Command::new(&java)
        .arg("-jar")
        .arg(&jar)
        .arg("-s")
        .arg(&scenarios)
        .arg("-r")
        .arg(&dir)
        .arg("-o")
        .arg(&tmp)
        .arg(input)
        .stdin(Stdio::from(stdin_file))
        .output()
        .map_err(|e| {
            format!(
                "Konnte Java nicht starten ({}). Ist eine JRE installiert?",
                e
            )
        })?;
    let _ = std::fs::remove_file(&empty_stdin);

    // Validator returns non-zero on rejected input but still writes a report.
    let stderr = String::from_utf8_lossy(&output.stderr);
    let report_xml = find_report(&tmp, input)
        .ok_or_else(|| format!("Kein Report gefunden. stderr: {}", stderr))?;

    let xml = std::fs::read_to_string(&report_xml).map_err(|e| format!("read report: {}", e))?;
    let mut report = parse_report(&xml);
    report.raw_report_path = report_xml.to_string_lossy().into_owned();
    Ok(report)
}

fn find_report(out_dir: &Path, input: &Path) -> Option<PathBuf> {
    let stem = input.file_stem()?.to_string_lossy().into_owned();
    let candidate = out_dir.join(format!("{}-report.xml", stem));
    if candidate.exists() {
        return Some(candidate);
    }
    // Fallback: newest *-report.xml in dir.
    std::fs::read_dir(out_dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.to_string_lossy().ends_with("-report.xml"))
        .max_by_key(|p| p.metadata().and_then(|m| m.modified()).ok())
}

/// Naive but sufficient parser for the KoSIT VARL report.
/// Extracts overall validity, matched scenario, and any svrl:failed-assert messages.
/// We avoid pulling in a full XML crate — string scans are enough for this shape.
fn parse_report(xml: &str) -> ValidationReport {
    let valid = xml.contains("<rep:report")
        && find_attr(xml, "<rep:report", "valid").as_deref() == Some("true");

    let scenario = between(xml, "<s:name>", "</s:name>");

    let mut findings: Vec<ValidationFinding> = Vec::new();
    for chunk in split_after(xml, "<svrl:failed-assert") {
        let test = find_attr(chunk, "", "test");
        let code = find_attr(chunk, "", "id");
        let location = find_attr(chunk, "", "location");
        let message = between(chunk, "<svrl:text>", "</svrl:text>")
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| test.clone().unwrap_or_default());
        if message.is_empty() {
            continue;
        }
        findings.push(ValidationFinding {
            severity: "error".into(),
            code,
            message,
            location,
        });
    }

    // Failed XSD/Schematron steps without explicit failed-assert payload still
    // need surfacing — if no findings but report says invalid, emit a generic.
    if !valid && findings.is_empty() {
        findings.push(ValidationFinding {
            severity: "error".into(),
            code: None,
            message: "Validierung fehlgeschlagen — Details siehe Report-XML.".into(),
            location: None,
        });
    }

    ValidationReport {
        valid,
        scenario,
        findings,
        raw_report_path: String::new(),
    }
}

fn find_attr(haystack: &str, tag_prefix: &str, attr: &str) -> Option<String> {
    let start = haystack.find(tag_prefix)?;
    let rest = &haystack[start..];
    let needle = format!(r#"{}=""#, attr);
    let attr_start = rest.find(&needle)? + needle.len();
    let attr_end = rest[attr_start..].find('"')?;
    Some(rest[attr_start..attr_start + attr_end].to_string())
}

fn between(haystack: &str, open: &str, close: &str) -> Option<String> {
    let s = haystack.find(open)? + open.len();
    let e = haystack[s..].find(close)?;
    Some(haystack[s..s + e].to_string())
}

fn split_after<'a>(haystack: &'a str, marker: &str) -> Vec<&'a str> {
    let mut out = Vec::new();
    let mut rest = haystack;
    while let Some(pos) = rest.find(marker) {
        rest = &rest[pos + marker.len()..];
        let end = rest.find("</svrl:failed-assert>").unwrap_or(rest.len());
        out.push(&rest[..end]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_REPORT: &str = r#"<?xml version="1.0"?>
<rep:report xmlns:rep="http://www.xoev.de/de/validator/varl/1"
            xmlns:s="http://www.xoev.de/de/validator/framework/1/scenarios"
            valid="true">
  <rep:scenarioMatched>
    <s:scenario><s:name>EN16931 (CII)</s:name></s:scenario>
  </rep:scenarioMatched>
</rep:report>"#;

    const INVALID_REPORT: &str = r#"<?xml version="1.0"?>
<rep:report xmlns:rep="http://www.xoev.de/de/validator/varl/1"
            xmlns:s="http://www.xoev.de/de/validator/framework/1/scenarios"
            xmlns:svrl="http://purl.oclc.org/dsdl/svrl"
            valid="false">
  <rep:scenarioMatched>
    <s:scenario><s:name>EN16931 (CII)</s:name></s:scenario>
  </rep:scenarioMatched>
  <svrl:failed-assert id="BR-CO-26" test="exists(...)" location="/rsm:CrossIndustryInvoice[1]">
    <svrl:text>Seller must be identifiable.</svrl:text>
  </svrl:failed-assert>
</rep:report>"#;

    #[test]
    fn parses_valid_report() {
        let r = parse_report(VALID_REPORT);
        assert!(r.valid);
        assert_eq!(r.scenario.as_deref(), Some("EN16931 (CII)"));
        assert!(r.findings.is_empty());
    }

    #[test]
    fn parses_invalid_report_with_failed_assert() {
        let r = parse_report(INVALID_REPORT);
        assert!(!r.valid);
        assert_eq!(r.findings.len(), 1);
        let f = &r.findings[0];
        assert_eq!(f.code.as_deref(), Some("BR-CO-26"));
        assert_eq!(f.message, "Seller must be identifiable.");
        assert_eq!(f.location.as_deref(), Some("/rsm:CrossIndustryInvoice[1]"));
    }

    #[test]
    fn invalid_without_findings_emits_generic() {
        let xml = r#"<rep:report xmlns:rep="urn:x" valid="false"></rep:report>"#;
        let r = parse_report(xml);
        assert!(!r.valid);
        assert_eq!(r.findings.len(), 1);
        assert_eq!(r.findings[0].severity, "error");
    }
}
