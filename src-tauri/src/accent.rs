// Liest die OS-Akzentfarbe. Windows: HKCU\Software\Microsoft\Windows\DWM\AccentColor
// (DWORD im ABGR-Format). macOS/Linux: noch nicht implementiert — Frontend fällt
// dann auf ein Default-Preset zurück.

#[cfg(windows)]
#[tauri::command]
pub fn get_system_accent_color() -> Option<[u8; 3]> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let dwm = hkcu.open_subkey("Software\\Microsoft\\Windows\\DWM").ok()?;
    let accent: u32 = dwm.get_value("AccentColor").ok()?;
    let r = (accent & 0xFF) as u8;
    let g = ((accent >> 8) & 0xFF) as u8;
    let b = ((accent >> 16) & 0xFF) as u8;
    Some([r, g, b])
}

#[cfg(not(windows))]
#[tauri::command]
pub fn get_system_accent_color() -> Option<[u8; 3]> {
    None
}
