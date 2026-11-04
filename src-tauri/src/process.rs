//! Spawning helper for the console child processes (`java.exe`, sidecar).

use std::ffi::OsStr;
use std::process::Command;

/// Win32 `CREATE_NO_WINDOW` process creation flag.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A `Command` that does not open a console window on Windows. The release
/// build runs in the GUI subsystem, so without this flag every console child
/// gets a visible, empty console of its own. Piped stdio is unaffected.
pub fn background_command(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
