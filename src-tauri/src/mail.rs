//! Hands a document over to the user's mail program with the PDF attached.
//! No SMTP and no network: Windows uses Simple MAPI, macOS drives Mail.app
//! through `osascript`, Linux calls `xdg-email`.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, WebviewWindow};

use crate::process::run_blocking;
use crate::tenants;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailRequest {
    to: String,
    subject: String,
    body: String,
    attachment_path: String,
}

/// What the frontend can distinguish: the compose window is open, the user
/// closed it again, or no way to open one worked (the frontend then falls back
/// to `mailto:`).
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum MailOutcome {
    HandedOff,
    Cancelled,
    Unavailable { message: String },
}

impl MailOutcome {
    fn unavailable(message: impl Into<String>) -> Self {
        Self::Unavailable {
            message: message.into(),
        }
    }
}

/// Async so a slow mail client cannot block the main thread.
#[tauri::command]
pub async fn compose_mail(
    app: AppHandle,
    window: WebviewWindow,
    request: MailRequest,
) -> Result<MailOutcome, String> {
    let documents_root = tenants::active_documents_root_for(&app)?;
    let attachment = validate(&request, &documents_root)?;
    let owner = owner_window(&window);
    run_blocking(move || Ok(platform::compose(&request, &attachment, owner))).await
}

/// Native handle of the calling window, so the mail program's window is owned
/// by Zettel. 0 (no owner) where there is no such handle.
fn owner_window(window: &WebviewWindow) -> usize {
    #[cfg(windows)]
    {
        window.hwnd().map_or(0, |hwnd| hwnd.0 as usize)
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        0
    }
}

/// Returns the attachment as a normalized path. Rejects input the platform
/// tools could misread: a relative or missing attachment, a non-PDF file, one
/// outside the documents root (this command is not covered by the opener
/// scope), a recipient that smuggles in a line break or an option flag.
fn validate(request: &MailRequest, documents_root: &Path) -> Result<PathBuf, String> {
    let recipient = request.to.trim();
    if recipient.chars().any(char::is_control) || recipient.starts_with('-') {
        return Err("Ungültige Empfängeradresse.".to_string());
    }

    let path = Path::new(&request.attachment_path);
    if !path.is_absolute() {
        return Err("Der Anhang muss ein absoluter Pfad sein.".to_string());
    }
    let is_pdf = path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));
    if !is_pdf {
        return Err("Als Anhang ist nur eine PDF-Datei erlaubt.".to_string());
    }
    if path.to_str().is_none() {
        return Err("Der Anhang-Pfad enthält ungültige Zeichen.".to_string());
    }
    if !path.is_file() {
        return Err(format!("Anhang nicht gefunden: {}", path.display()));
    }
    let inside_root = match (path.canonicalize(), documents_root.canonicalize()) {
        (Ok(file), Ok(root)) => file.starts_with(root),
        _ => false,
    };
    if !inside_root {
        return Err("Der Anhang liegt nicht im Dokumente-Ordner von Zettel.".to_string());
    }
    // The frontend may join with `/`; mail clients expect the native separator.
    Ok(path.components().collect::<PathBuf>())
}

#[cfg(windows)]
mod platform {
    use super::{crlf, to_wide, MailOutcome, MailRequest};
    use std::ffi::c_void;
    use std::path::Path;
    use std::ptr::{null, null_mut};
    use std::sync::OnceLock;

    const MAPI_LOGON_UI: u32 = 0x0000_0001;
    const MAPI_DIALOG: u32 = 0x0000_0008;
    const MAPI_TO: u32 = 1;
    const FILE_POSITION_UNSPECIFIED: u32 = u32::MAX;
    const LOAD_LIBRARY_SEARCH_SYSTEM32: u32 = 0x0000_0800;

    const SUCCESS_SUCCESS: u32 = 0;
    const MAPI_E_USER_ABORT: u32 = 1;

    #[repr(C)]
    struct MapiFileDescW {
        reserved: u32,
        flags: u32,
        position: u32,
        path_name: *const u16,
        file_name: *const u16,
        file_type: *const c_void,
    }

    #[repr(C)]
    struct MapiRecipDescW {
        reserved: u32,
        recip_class: u32,
        name: *const u16,
        address: *const u16,
        entry_id_size: u32,
        entry_id: *const c_void,
    }

    #[repr(C)]
    struct MapiMessageW {
        reserved: u32,
        subject: *const u16,
        note_text: *const u16,
        message_type: *const u16,
        date_received: *const u16,
        conversation_id: *const u16,
        flags: u32,
        originator: *const MapiRecipDescW,
        recip_count: u32,
        recips: *const MapiRecipDescW,
        file_count: u32,
        files: *const MapiFileDescW,
    }

    type MapiSendMailW = unsafe extern "system" fn(
        session: usize,
        ui_param: usize,
        message: *const MapiMessageW,
        flags: u32,
        reserved: u32,
    ) -> u32;

    #[link(name = "kernel32")]
    extern "system" {
        fn LoadLibraryExW(name: *const u16, file: *mut c_void, flags: u32) -> *mut c_void;
        fn GetProcAddress(module: *mut c_void, name: *const u8) -> *mut c_void;
    }

    /// Resolved once and kept for the life of the process: the library is never
    /// unloaded, because mail providers may leave threads running in it after a
    /// call returns. A failed lookup is not cached, so a client installed
    /// meanwhile is found on the next try.
    static SEND_MAIL: OnceLock<MapiSendMailW> = OnceLock::new();

    fn send_mail_function() -> Result<MapiSendMailW, &'static str> {
        if let Some(function) = SEND_MAIL.get() {
            return Ok(*function);
        }
        let name = to_wide("MAPI32.dll");
        // SAFETY: `name` is a nul-terminated UTF-16 string that outlives the call.
        let module =
            unsafe { LoadLibraryExW(name.as_ptr(), null_mut(), LOAD_LIBRARY_SEARCH_SYSTEM32) };
        if module.is_null() {
            return Err("MAPI32.dll konnte nicht geladen werden.");
        }
        // SAFETY: `module` is a loaded module and the name is nul-terminated.
        let symbol = unsafe { GetProcAddress(module, c"MAPISendMailW".as_ptr().cast()) };
        if symbol.is_null() {
            return Err("Das installierte Mail-Programm unterstützt Simple MAPI nicht.");
        }
        // SAFETY: MAPISendMailW has exactly the signature of `MapiSendMailW`.
        let function = unsafe { std::mem::transmute::<*mut c_void, MapiSendMailW>(symbol) };
        Ok(*SEND_MAIL.get_or_init(|| function))
    }

    /// `owner` is the HWND of the calling window (0 for none).
    pub fn compose(request: &MailRequest, attachment: &Path, owner: usize) -> MailOutcome {
        let send_mail = match send_mail_function() {
            Ok(function) => function,
            Err(message) => return MailOutcome::unavailable(message),
        };

        let recipient = request.to.trim();
        let subject = to_wide(&request.subject);
        let note_text = to_wide(&crlf(&request.body));
        let address = to_wide(&format!("SMTP:{recipient}"));
        let name = to_wide(recipient);
        let path_name = to_wide(&attachment.to_string_lossy());
        let file_name = attachment
            .file_name()
            .map(|file_name| to_wide(&file_name.to_string_lossy()))
            .unwrap_or_default();

        let recipients = [MapiRecipDescW {
            reserved: 0,
            recip_class: MAPI_TO,
            name: name.as_ptr(),
            address: address.as_ptr(),
            entry_id_size: 0,
            entry_id: null(),
        }];
        let files = [MapiFileDescW {
            reserved: 0,
            flags: 0,
            position: FILE_POSITION_UNSPECIFIED,
            path_name: path_name.as_ptr(),
            file_name: if file_name.is_empty() {
                null()
            } else {
                file_name.as_ptr()
            },
            file_type: null(),
        }];
        let message = MapiMessageW {
            reserved: 0,
            subject: subject.as_ptr(),
            note_text: note_text.as_ptr(),
            message_type: null(),
            date_received: null(),
            conversation_id: null(),
            flags: 0,
            originator: null(),
            recip_count: if recipient.is_empty() { 0 } else { 1 },
            recips: recipients.as_ptr(),
            file_count: 1,
            files: files.as_ptr(),
        };

        // SAFETY: every pointer in `message` points into a local that lives until
        // the call returns, and the structs match the layout in mapi.h.
        let code = unsafe { send_mail(0, owner, &message, MAPI_DIALOG | MAPI_LOGON_UI, 0) };
        outcome_for(code)
    }

    pub(super) fn outcome_for(code: u32) -> MailOutcome {
        match code {
            SUCCESS_SUCCESS => MailOutcome::HandedOff,
            MAPI_E_USER_ABORT => MailOutcome::Cancelled,
            other => MailOutcome::unavailable(describe_error(other)),
        }
    }

    /// Reasons for the MAPI_E_* codes in mapi.h.
    fn describe_error(code: u32) -> String {
        let reason = match code {
            2 => "allgemeiner Fehler (häufig: kein klassisches Mail-Programm als Standard)",
            3 => "Anmeldung beim Mail-Programm fehlgeschlagen",
            4 => "Datenträger voll",
            5 => "zu wenig Speicher",
            6 => "Zugriff verweigert",
            9 => "zu viele Anhänge",
            10 => "zu viele Empfänger",
            11 => "Anhang nicht gefunden",
            12 => "Anhang konnte nicht geöffnet werden",
            13 => "Anhang konnte nicht geschrieben werden",
            14 => "unbekannter Empfänger",
            15 => "ungültiger Empfängertyp",
            21 => "mehrdeutiger Empfänger",
            _ => "unbekannter Fehler",
        };
        format!("Simple MAPI meldet Fehlercode {code}: {reason}.")
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn success_and_user_abort_are_not_failures() {
            assert_eq!(outcome_for(0), MailOutcome::HandedOff);
            assert_eq!(outcome_for(1), MailOutcome::Cancelled);
        }

        #[test]
        fn other_codes_name_the_code_and_a_reason() {
            let MailOutcome::Unavailable { message } = outcome_for(2) else {
                panic!("MAPI_E_FAILURE must be a failure");
            };
            assert!(message.contains("Fehlercode 2"));
            assert!(message.contains("klassisches Mail-Programm"));
        }

        #[test]
        fn recipient_errors_use_the_codes_from_mapi_h() {
            let reason = |code| match outcome_for(code) {
                MailOutcome::Unavailable { message } => message,
                other => panic!("code {code} must be a failure, got {other:?}"),
            };

            assert!(reason(14).contains("unbekannter Empfänger"));
            assert!(reason(15).contains("ungültiger Empfängertyp"));
            assert!(reason(21).contains("mehrdeutiger Empfänger"));
        }

        #[cfg(target_pointer_width = "64")]
        #[test]
        fn mapi_structs_have_the_sizes_the_api_expects_on_x64() {
            assert_eq!(std::mem::size_of::<MapiMessageW>(), 96);
            assert_eq!(std::mem::size_of::<MapiRecipDescW>(), 40);
            assert_eq!(std::mem::size_of::<MapiFileDescW>(), 40);
        }

        #[test]
        fn an_unknown_code_still_produces_a_message() {
            let MailOutcome::Unavailable { message } = outcome_for(999) else {
                panic!("unknown codes must be failures");
            };
            assert!(message.contains("999"));
        }

        /// Opens a real compose window in the default MAPI client. Run by hand:
        /// `cargo test --lib mail::platform::tests::real_mapi -- --ignored --nocapture`
        #[test]
        #[ignore = "opens the default mail client and needs a person to look at it"]
        fn real_mapi_call_reports_what_the_installed_client_does() {
            let dir = crate::testutil::TempDir::new("mapi");
            let pdf = dir.path().join("Rechnung-Müller.pdf");
            std::fs::write(&pdf, b"%PDF-1.4\n%%EOF\n").unwrap();
            let request = MailRequest {
                to: "kunde@example.com".to_string(),
                subject: "Rechnung RE-2026-0001 für Müller & Söhne".to_string(),
                body: "Guten Tag,\nanbei die Rechnung.\n\nViele Grüße".to_string(),
                attachment_path: pdf.to_string_lossy().into_owned(),
            };

            let outcome = compose(&request, &pdf, 0);

            println!("MAPI outcome: {outcome:?}");
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::MailOutcome;
    use super::MailRequest;
    use crate::process::{background_command, output_within};
    use std::io::ErrorKind;
    use std::path::Path;
    use std::process::Stdio;
    use std::time::Duration;

    /// Mail programs may keep the launcher process alive while their window is
    /// open, so waiting longer than this would only hold the worker thread.
    const LAUNCHER_TIMEOUT: Duration = Duration::from_secs(60);

    pub fn compose(request: &MailRequest, attachment: &Path, _owner: usize) -> MailOutcome {
        let attachment = attachment.to_string_lossy();
        let (program, args) = launcher(request, &attachment);

        let child = match background_command(program)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(e) if e.kind() == ErrorKind::NotFound => {
                return MailOutcome::unavailable(format!("{program} wurde nicht gefunden."))
            }
            Err(e) => {
                return MailOutcome::unavailable(format!(
                    "{program} konnte nicht gestartet werden: {e}"
                ))
            }
        };

        match output_within(child, LAUNCHER_TIMEOUT) {
            Ok(Some(output)) if output.status.success() => MailOutcome::HandedOff,
            Ok(Some(output)) => MailOutcome::unavailable(format!(
                "{program} meldet einen Fehler: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )),
            // Still running after the timeout: the mail window is most likely open.
            Ok(None) => MailOutcome::HandedOff,
            Err(e) => MailOutcome::unavailable(format!("{program} nicht lesbar: {e}")),
        }
    }

    #[cfg(target_os = "macos")]
    fn launcher(request: &MailRequest, attachment: &str) -> (&'static str, Vec<String>) {
        ("osascript", super::osascript_args(request, attachment))
    }

    #[cfg(not(target_os = "macos"))]
    fn launcher(request: &MailRequest, attachment: &str) -> (&'static str, Vec<String>) {
        ("xdg-email", super::xdg_email_args(request, attachment))
    }
}

/// UTF-16 with the terminating nul the Win32 API expects.
#[cfg(any(windows, test))]
fn to_wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Simple MAPI note text uses CRLF line breaks.
#[cfg(any(windows, test))]
fn crlf(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\n', "\r\n")
}

/// The values travel as `argv` of the script, never inside its source, so no
/// quoting of subject or body is needed.
#[cfg(any(target_os = "macos", test))]
fn osascript_args(request: &MailRequest, attachment: &str) -> Vec<String> {
    const SCRIPT: [&str; 14] = [
        "on run argv",
        "set toAddress to item 1 of argv",
        "set theSubject to item 2 of argv",
        "set theBody to item 3 of argv",
        "set attachmentFile to POSIX file (item 4 of argv)",
        "tell application \"Mail\"",
        "set theMessage to make new outgoing message with properties {subject:theSubject, content:theBody, visible:true}",
        "tell theMessage",
        "if toAddress is not \"\" then make new to recipient at end of to recipients with properties {address:toAddress}",
        "make new attachment with properties {file name:attachmentFile} at after the last paragraph of content",
        "end tell",
        "activate",
        "end tell",
        "end run",
    ];

    let mut args: Vec<String> = SCRIPT
        .iter()
        .flat_map(|line| ["-e".to_string(), (*line).to_string()])
        .collect();
    args.push("--".to_string());
    args.extend([
        request.to.trim().to_string(),
        request.subject.clone(),
        request.body.clone(),
        attachment.to_string(),
    ]);
    args
}

#[cfg(any(all(unix, not(target_os = "macos")), test))]
fn xdg_email_args(request: &MailRequest, attachment: &str) -> Vec<String> {
    let mut args = vec![
        "--utf8".to_string(),
        "--subject".to_string(),
        request.subject.clone(),
        "--body".to_string(),
        request.body.clone(),
        "--attach".to_string(),
        attachment.to_string(),
    ];
    let recipient = request.to.trim();
    if !recipient.is_empty() {
        args.push(recipient.to_string());
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::TempDir;

    fn request(to: &str, attachment_path: &str) -> MailRequest {
        MailRequest {
            to: to.to_string(),
            subject: "Rechnung \"RE-1\" für Müller & Söhne".to_string(),
            body: "Zeile 1\nZeile 2".to_string(),
            attachment_path: attachment_path.to_string(),
        }
    }

    fn temp_pdf(dir: &TempDir) -> PathBuf {
        let pdf = dir.path().join("Rechnung.pdf");
        std::fs::write(&pdf, b"%PDF-1.4").unwrap();
        pdf
    }

    #[test]
    fn utf16_is_nul_terminated_and_keeps_umlauts_and_surrogate_pairs() {
        assert_eq!(to_wide("äß"), vec![0x00e4, 0x00df, 0]);
        assert_eq!(to_wide("😀"), vec![0xd83d, 0xde00, 0]);
        assert_eq!(to_wide(""), vec![0]);
    }

    #[test]
    fn line_breaks_become_crlf_without_doubling_existing_ones() {
        assert_eq!(crlf("a\nb\r\nc"), "a\r\nb\r\nc");
    }

    #[test]
    fn osascript_gets_the_values_as_arguments_after_the_script() {
        let args = osascript_args(
            &request(" kunde@example.com ", "/tmp/Rechnung.pdf"),
            "/tmp/Rechnung.pdf",
        );

        let separator = args.iter().position(|a| a == "--").unwrap();
        assert_eq!(
            &args[separator + 1..],
            [
                "kunde@example.com",
                "Rechnung \"RE-1\" für Müller & Söhne",
                "Zeile 1\nZeile 2",
                "/tmp/Rechnung.pdf",
            ]
        );
        assert!(args[..separator]
            .chunks(2)
            .all(|pair| pair[0] == "-e" && !pair[1].contains("Müller")));
    }

    #[test]
    fn xdg_email_attaches_the_pdf_and_ends_with_the_recipient() {
        let args = xdg_email_args(&request("kunde@example.com", "/tmp/a.pdf"), "/tmp/a.pdf");

        assert_eq!(
            args,
            [
                "--utf8",
                "--subject",
                "Rechnung \"RE-1\" für Müller & Söhne",
                "--body",
                "Zeile 1\nZeile 2",
                "--attach",
                "/tmp/a.pdf",
                "kunde@example.com",
            ]
        );
    }

    #[test]
    fn xdg_email_without_recipient_leaves_the_address_out() {
        let args = xdg_email_args(&request("  ", "/tmp/a.pdf"), "/tmp/a.pdf");

        assert_eq!(args.last().map(String::as_str), Some("/tmp/a.pdf"));
    }

    #[test]
    fn a_valid_request_returns_the_attachment() {
        let dir = TempDir::new("mail-valid");
        let pdf = temp_pdf(&dir);

        let attachment = validate(
            &request("kunde@example.com", pdf.to_str().unwrap()),
            dir.path(),
        )
        .unwrap();

        assert_eq!(attachment, pdf);
    }

    #[test]
    fn a_file_in_a_subfolder_of_the_documents_root_is_allowed() {
        let dir = TempDir::new("mail-subfolder");
        let folder = dir.path().join("Rechnungen");
        std::fs::create_dir_all(&folder).unwrap();
        let pdf = folder.join("RE-1.pdf");
        std::fs::write(&pdf, b"%PDF-1.4").unwrap();

        assert!(validate(&request("", pdf.to_str().unwrap()), dir.path()).is_ok());
    }

    #[test]
    fn a_pdf_outside_the_documents_root_is_rejected() {
        let root = TempDir::new("mail-root");
        let elsewhere = TempDir::new("mail-elsewhere");
        let pdf = temp_pdf(&elsewhere);

        let error = validate(&request("", pdf.to_str().unwrap()), root.path()).unwrap_err();

        assert!(error.contains("Dokumente-Ordner"));
    }

    #[test]
    fn dot_dot_segments_cannot_leave_the_documents_root() {
        let root = TempDir::new("mail-traversal-root");
        let elsewhere = TempDir::new("mail-traversal-outside");
        let pdf = temp_pdf(&elsewhere);
        let traversal = root
            .path()
            .join("..")
            .join(elsewhere.path().file_name().unwrap())
            .join("Rechnung.pdf");

        assert!(validate(&request("", traversal.to_str().unwrap()), root.path()).is_err());
        assert!(pdf.is_file());
    }

    #[test]
    fn a_root_that_cannot_be_resolved_allows_nothing() {
        let dir = TempDir::new("mail-no-root");
        let pdf = temp_pdf(&dir);
        let missing_root = dir.path().join("fehlt");

        assert!(validate(&request("", pdf.to_str().unwrap()), &missing_root).is_err());
    }

    #[test]
    fn mixed_separators_are_normalized() {
        let dir = TempDir::new("mail-separators");
        let pdf = temp_pdf(&dir);
        let mixed = format!("{}/Rechnung.pdf", dir.path().display());

        let attachment = validate(&request("", &mixed), dir.path()).unwrap();

        assert_eq!(attachment, pdf);
    }

    #[test]
    fn a_relative_attachment_is_rejected() {
        let dir = TempDir::new("mail-relative");

        assert!(validate(&request("", "Rechnung.pdf"), dir.path()).is_err());
    }

    #[test]
    fn a_missing_attachment_is_rejected() {
        let dir = TempDir::new("mail-missing");
        let missing = dir.path().join("fehlt.pdf");

        let error = validate(&request("", missing.to_str().unwrap()), dir.path()).unwrap_err();

        assert!(error.contains("nicht gefunden"));
    }

    #[test]
    fn only_pdf_files_may_be_attached() {
        let dir = TempDir::new("mail-extension");
        let text = dir.path().join("geheim.txt");
        std::fs::write(&text, b"x").unwrap();

        assert!(validate(&request("", text.to_str().unwrap()), dir.path()).is_err());
    }

    #[test]
    fn a_recipient_that_could_inject_options_or_headers_is_rejected() {
        let dir = TempDir::new("mail-recipient");
        let pdf = temp_pdf(&dir);
        let path = pdf.to_str().unwrap();

        assert!(validate(&request("--attach", path), dir.path()).is_err());
        assert!(validate(&request("a@b.de\r\nBcc: x@y.de", path), dir.path()).is_err());
    }

    #[test]
    fn outcomes_serialize_as_tagged_objects_for_the_frontend() {
        let json = |outcome: &MailOutcome| serde_json::to_string(outcome).unwrap();

        assert_eq!(json(&MailOutcome::HandedOff), r#"{"status":"handedOff"}"#);
        assert_eq!(json(&MailOutcome::Cancelled), r#"{"status":"cancelled"}"#);
        assert_eq!(
            json(&MailOutcome::unavailable("kein Client")),
            r#"{"status":"unavailable","message":"kein Client"}"#
        );
    }
}
