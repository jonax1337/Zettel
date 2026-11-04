//! KoSIT Validator integration. Spawns `java -jar` against the bundled
//! validator + xrechnung scenarios, parses the report XML, returns a
//! structured result the UI can render.
//!
//! Validator path resolution:
//!   1. dev:  <workspace>/tools/kosit-validator/  +  <workspace>/tools/jre/
//!   2. prod: bundled resources <resource_dir>/kosit-validator/ + /jre/
//!
//! Both the KoSIT validator and a jlink-minimized JRE ship as bundled
//! resources (see `tauri.bundle.conf.json`), so users need no system Java.
//!
//! NOTE: on Windows `resource_dir()` returns a *verbatim* path (`\\?\C:\…`).
//! The JVM cannot open a JAR handed to it as a `\\?\`-prefixed argument, so
//! resource paths are run through `simplify()` before reaching the `java`
//! process.

use crate::paths::app_data_dir;
use crate::process::{background_command, output_within, run_blocking};
use crate::sidecar;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const VALIDATOR_JAR: &str = "validator.jar";
const SCENARIOS_FILE: &str = "scenarios.xml";
const REPORT_SUFFIX: &str = "-report.xml";
const SEVERITY_ERROR: &str = "error";
const WORK_ROOT_DIR: &str = "zettel-validator";
const EXTRACTED_XML_FILE: &str = "rechnung.xml";
/// The JVM start plus the Schematron run take a few seconds; far longer
/// means the validator hangs.
const VALIDATOR_TIMEOUT: Duration = Duration::from_secs(180);

/// Distinguishes runs started in the same nanosecond.
static RUN_COUNTER: AtomicU64 = AtomicU64::new(0);

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
}

#[derive(Debug, Serialize)]
pub struct ValidatorStatus {
    pub installed: bool,
    pub validator_dir: String,
    pub has_java: bool,
    pub java_version: Option<String>,
}

fn workspace_tool_dir(name: &str) -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop();
    p.push("tools");
    p.push(name);
    p
}

/// Strip the Windows verbatim prefix (`\\?\`) from a path. `resource_dir()`
/// returns verbatim paths, which the JVM rejects when they appear as a
/// `-jar` argument. No-op on non-Windows and on already-simple paths.
fn simplify(p: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let s = p.to_string_lossy();
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{}", rest));
        }
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(rest.to_string());
        }
    }
    p
}

fn resolve_validator_dir(app: &AppHandle) -> PathBuf {
    // Dev: workspace tools/ first if it exists. Prod: shipped resources.
    if cfg!(debug_assertions) {
        let dev = workspace_tool_dir("kosit-validator");
        if dev.join(VALIDATOR_JAR).exists() {
            return dev;
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        let bundled = res.join("kosit-validator");
        if bundled.join(VALIDATOR_JAR).exists() {
            return simplify(bundled);
        }
    }
    app_data_dir(app)
        .map(|dir| dir.join("validator"))
        .unwrap_or_else(|_| PathBuf::from("validator"))
}

/// Returns the path to a Java executable. Prefers bundled JRE
/// (shipped in resources/jre/), falls back to system `java` on PATH.
fn resolve_java(app: &AppHandle) -> PathBuf {
    let exe = if cfg!(windows) { "java.exe" } else { "java" };

    if cfg!(debug_assertions) {
        let dev = workspace_tool_dir("jre").join("bin").join(exe);
        if dev.exists() {
            return dev;
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        let bundled = res.join("jre").join("bin").join(exe);
        if bundled.exists() {
            return simplify(bundled);
        }
    }
    PathBuf::from("java")
}

fn detect_java_at(java: &Path) -> Option<String> {
    let out = background_command(java).arg("-version").output().ok()?;
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
    run_blocking(move || {
        let dir = resolve_validator_dir(&app);
        let installed = dir.join(VALIDATOR_JAR).exists() && dir.join(SCENARIOS_FILE).exists();
        let java = detect_java_at(&resolve_java(&app));
        Ok(ValidatorStatus {
            installed,
            validator_dir: dir.to_string_lossy().into_owned(),
            has_java: java.is_some(),
            java_version: java,
        })
    })
    .await
}

#[tauri::command]
pub async fn validate_einvoice_pdf(
    app: AppHandle,
    pdf_path: String,
) -> Result<ValidationReport, String> {
    run_blocking(move || validate_pdf(&app, &pdf_path)).await
}

#[tauri::command]
pub async fn validate_einvoice_xml(
    app: AppHandle,
    xml_path: String,
) -> Result<ValidationReport, String> {
    run_blocking(move || {
        let input = Path::new(&xml_path);
        if !input.exists() {
            return Err(format!("Eingabedatei nicht gefunden: {xml_path}"));
        }
        validate_in(&app, input, &RunDir::create()?)
    })
    .await
}

fn validate_pdf(app: &AppHandle, pdf_path: &str) -> Result<ValidationReport, String> {
    let extract = sidecar::extract_xml_only(app, pdf_path)?;
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

    let run_dir = RunDir::create()?;
    let input = run_dir.0.join(EXTRACTED_XML_FILE);
    fs::write(&input, xml).map_err(|e| format!("tmp write: {e}"))?;
    validate_in(app, &input, &run_dir)
}

/// Runs the validator on `input`, writing its report into `run_dir`.
fn validate_in(app: &AppHandle, input: &Path, run_dir: &RunDir) -> Result<ValidationReport, String> {
    let dir = resolve_validator_dir(app);
    let jar = dir.join(VALIDATOR_JAR);
    let scenarios = dir.join(SCENARIOS_FILE);
    if !jar.exists() || !scenarios.exists() {
        return Err(format!(
            "Validator nicht installiert. Erwartet: {}",
            dir.display()
        ));
    }

    let run = ValidatorRun {
        java: resolve_java(app),
        jar,
        scenarios,
        repository: dir,
        work_dir: run_dir.0.clone(),
    };
    let stderr = run.execute(input)?;

    // Validator returns non-zero on rejected input but still writes a report.
    let report_path = find_report(&run.work_dir, input)
        .ok_or_else(|| format!("Kein Report gefunden. stderr: {stderr}"))?;
    let xml = fs::read_to_string(&report_path).map_err(|e| format!("read report: {e}"))?;
    Ok(parse_report(&xml))
}

/// A work dir of its own per validation, so parallel runs never read each
/// other's input or report. Removed with everything in it when dropped.
struct RunDir(PathBuf);

impl RunDir {
    fn create() -> Result<Self, String> {
        Self::create_in(&std::env::temp_dir().join(WORK_ROOT_DIR))
    }

    fn create_in(root: &Path) -> Result<Self, String> {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let run = RUN_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = root.join(format!("run-{}-{nanos}-{run}", std::process::id()));
        fs::create_dir_all(&dir).map_err(|e| format!("tmpdir: {e}"))?;
        Ok(Self(dir))
    }
}

impl Drop for RunDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

struct ValidatorRun {
    java: PathBuf,
    jar: PathBuf,
    scenarios: PathBuf,
    repository: PathBuf,
    work_dir: PathBuf,
}

impl ValidatorRun {
    /// Runs the validator on `input` and returns its stderr.
    fn execute(&self, input: &Path) -> Result<String, String> {
        // KoSIT prüft `FileInputStream.available()` um stdin-Pipe-Mode zu erkennen.
        // Auf Windows wirft `available()` für character devices (Console-Handle,
        // NUL) eine `IOException: Unzulässige Funktion` — `Stdio::null()` reicht
        // also nicht. Wir reichen eine leere reguläre Datei rein: disk-type ist
        // pollbar, `available()` liefert sauber 0, `isPiped()` wird false.
        let empty_stdin = self.work_dir.join("empty-stdin");
        fs::write(&empty_stdin, b"").map_err(|e| format!("empty stdin write: {e}"))?;
        let stdin_file =
            fs::File::open(&empty_stdin).map_err(|e| format!("empty stdin open: {e}"))?;

        let child = background_command(&self.java)
            .arg("-jar")
            .arg(&self.jar)
            .arg("-s")
            .arg(&self.scenarios)
            .arg("-r")
            .arg(&self.repository)
            .arg("-o")
            .arg(&self.work_dir)
            .arg(input)
            .stdin(Stdio::from(stdin_file))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Konnte Java nicht starten ({e}). Ist eine JRE installiert?"))?;
        let output = output_within(child, VALIDATOR_TIMEOUT)
            .map_err(|e| format!("Validator wait failed: {e}"))?
            .ok_or_else(|| {
                format!(
                    "Die E-Rechnungs-Validierung hat nicht innerhalb von {} Sekunden geantwortet und wurde abgebrochen.",
                    VALIDATOR_TIMEOUT.as_secs()
                )
            })?;
        Ok(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

fn is_report_file(path: &Path) -> bool {
    path.to_string_lossy().ends_with(REPORT_SUFFIX)
}

fn find_report(out_dir: &Path, input: &Path) -> Option<PathBuf> {
    let stem = input.file_stem()?.to_string_lossy().into_owned();
    let candidate = out_dir.join(format!("{stem}{REPORT_SUFFIX}"));
    if candidate.exists() {
        return Some(candidate);
    }
    // Fallback: newest *-report.xml in dir.
    fs::read_dir(out_dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| is_report_file(p))
        .max_by_key(|p| p.metadata().and_then(|m| m.modified()).ok())
}

/// Naive but sufficient parser for the KoSIT VARL report.
/// Extracts overall validity, matched scenario, and any svrl:failed-assert messages.
/// We avoid pulling in a full XML crate — string scans are enough for this shape.
fn parse_report(xml: &str) -> ValidationReport {
    let valid = start_tag(xml, "<rep:report")
        .and_then(|tag| attribute(tag, "valid"))
        .as_deref()
        == Some("true");

    let scenario = between(xml, "<s:name>", "</s:name>");

    let mut findings: Vec<ValidationFinding> = split_after(xml, "<svrl:failed-assert")
        .into_iter()
        .filter_map(parse_failed_assert)
        .collect();

    // Failed XSD/Schematron steps without explicit failed-assert payload still
    // need surfacing — if no findings but report says invalid, emit a generic.
    if !valid && findings.is_empty() {
        findings.push(ValidationFinding {
            severity: SEVERITY_ERROR.into(),
            code: None,
            message: "Validierung fehlgeschlagen — Details siehe Report-XML.".into(),
            location: None,
        });
    }

    ValidationReport {
        valid,
        scenario,
        findings,
    }
}

/// `chunk` is the text following `<svrl:failed-assert`, starting with its
/// attributes.
fn parse_failed_assert(chunk: &str) -> Option<ValidationFinding> {
    let tag = &chunk[..chunk.find('>').unwrap_or(chunk.len())];
    let message = between(chunk, "<svrl:text>", "</svrl:text>")
        .map(|s| s.trim().to_string())
        .or_else(|| attribute(tag, "test"))
        .filter(|m| !m.is_empty())?;
    Some(ValidationFinding {
        severity: SEVERITY_ERROR.into(),
        code: attribute(tag, "id"),
        message,
        location: attribute(tag, "location"),
    })
}

/// The opening tag starting at the first `tag_prefix`, up to its closing `>`.
fn start_tag<'a>(haystack: &'a str, tag_prefix: &str) -> Option<&'a str> {
    let rest = &haystack[haystack.find(tag_prefix)?..];
    Some(&rest[..rest.find('>').unwrap_or(rest.len())])
}

/// Value of the double-quoted attribute `name` in `tag`, with XML entities
/// resolved. Matches whole attribute names only (`valid`, not `invalid`).
fn attribute(tag: &str, name: &str) -> Option<String> {
    let needle = format!(r#"{name}=""#);
    let mut search_from = 0;
    while let Some(offset) = tag[search_from..].find(&needle) {
        let start = search_from + offset;
        let value_start = start + needle.len();
        if tag[..start].ends_with(char::is_whitespace) {
            let value_len = tag[value_start..].find('"')?;
            return Some(unescape_xml(&tag[value_start..value_start + value_len]));
        }
        search_from = value_start;
    }
    None
}

fn between(haystack: &str, open: &str, close: &str) -> Option<String> {
    let s = haystack.find(open)? + open.len();
    let e = haystack[s..].find(close)?;
    Some(unescape_xml(&haystack[s..s + e]))
}

/// `&amp;` goes last so that `&amp;lt;` decodes to the text `&lt;`.
fn unescape_xml(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
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
    use crate::testutil::TempDir;

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

    #[cfg(windows)]
    #[test]
    fn simplify_strips_verbatim_prefix() {
        assert_eq!(
            simplify(PathBuf::from(r"\\?\C:\Users\x\zettel\kosit-validator\validator.jar")),
            PathBuf::from(r"C:\Users\x\zettel\kosit-validator\validator.jar")
        );
        // Already-simple paths pass through unchanged.
        assert_eq!(
            simplify(PathBuf::from(r"C:\Users\x\validator.jar")),
            PathBuf::from(r"C:\Users\x\validator.jar")
        );
    }

    #[test]
    fn invalid_without_findings_emits_generic() {
        let xml = r#"<rep:report xmlns:rep="urn:x" valid="false"></rep:report>"#;
        let r = parse_report(xml);
        assert!(!r.valid);
        assert_eq!(r.findings.len(), 1);
        assert_eq!(r.findings[0].severity, "error");
    }

    #[test]
    fn message_and_attributes_are_xml_unescaped() {
        let xml = r#"<rep:report valid="false">
  <svrl:failed-assert id="BR-1" location="/a[@x=&quot;1&quot;]">
    <svrl:text>Betrag &lt; 0 &amp; kein Rabatt</svrl:text>
  </svrl:failed-assert></rep:report>"#;
        let f = &parse_report(xml).findings[0];
        assert_eq!(f.message, "Betrag < 0 & kein Rabatt");
        assert_eq!(f.location.as_deref(), Some(r#"/a[@x="1"]"#));
    }

    #[test]
    fn ampersand_is_unescaped_last() {
        assert_eq!(unescape_xml("&amp;lt;"), "&lt;");
    }

    #[test]
    fn report_without_valid_attribute_is_not_valid() {
        let xml = r#"<rep:report xmlns:rep="urn:x"><rep:step valid="true"/></rep:report>"#;
        assert!(!parse_report(xml).valid);
    }

    #[test]
    fn attribute_matches_whole_names_only() {
        assert_eq!(
            attribute(r#"<a invalid="true" valid="false""#, "valid").as_deref(),
            Some("false")
        );
        assert_eq!(attribute(r#"<a invalid="true""#, "valid"), None);
    }

    #[test]
    fn failed_assert_without_text_falls_back_to_its_test_expression() {
        let xml = r#"<rep:report valid="false"><svrl:failed-assert id="BR-2" test="count(x) = 1"></svrl:failed-assert></rep:report>"#;
        let f = &parse_report(xml).findings[0];
        assert_eq!(f.message, "count(x) = 1");
    }

    #[test]
    fn failed_assert_does_not_borrow_attributes_from_its_body() {
        let xml = r#"<rep:report valid="false"><svrl:failed-assert location="/x"><svrl:text>id="NOT-MINE"</svrl:text></svrl:failed-assert></rep:report>"#;
        assert_eq!(parse_report(xml).findings[0].code, None);
    }

    #[test]
    fn every_run_gets_a_fresh_work_dir_that_is_removed_afterwards() {
        let root = TempDir::new("validator-runs");
        let first = RunDir::create_in(root.path()).unwrap();
        let second = RunDir::create_in(root.path()).unwrap();
        assert_ne!(first.0, second.0);
        fs::write(first.0.join("rechnung-report.xml"), "<first/>").unwrap();
        assert!(find_report(&second.0, Path::new("rechnung.xml")).is_none());

        let first_path = first.0.clone();
        drop(first);

        assert!(!first_path.exists());
        assert!(second.0.is_dir());
    }

    #[test]
    fn report_named_after_the_input_is_preferred() {
        let dir = TempDir::new("report-by-stem");
        fs::write(dir.path().join("other-report.xml"), "<other/>").unwrap();
        fs::write(dir.path().join("invoice-report.xml"), "<mine/>").unwrap();
        let found = find_report(dir.path(), Path::new("C:/x/invoice.xml")).unwrap();
        assert_eq!(found, dir.path().join("invoice-report.xml"));
    }
}
