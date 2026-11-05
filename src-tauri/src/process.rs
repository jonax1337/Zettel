//! Spawning helpers for the console child processes (`java.exe`, sidecar).

use std::ffi::OsStr;
use std::io::{self, Read};
use std::process::{Child, Command, Output};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

/// Win32 `CREATE_NO_WINDOW` process creation flag.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const POLL_INTERVAL: Duration = Duration::from_millis(25);

/// A `Command` that does not open a console window on Windows. The release
/// build runs in the GUI subsystem, so without this flag every console child
/// gets a visible, empty console of its own. Piped stdio is unaffected.
pub fn background_command(program: impl AsRef<OsStr>) -> Command {
    #[cfg_attr(not(windows), allow(unused_mut))]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Like `Child::wait_with_output`, but kills the child once `timeout` has
/// passed and returns `None` then. Piped stdout/stderr are drained while
/// waiting, so a chatty child cannot block on a full pipe.
pub fn output_within(mut child: Child, timeout: Duration) -> io::Result<Option<Output>> {
    let stdout = child.stdout.take().map(drain);
    let stderr = child.stderr.take().map(drain);
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(Some(Output {
                status,
                stdout: collect(stdout),
                stderr: collect(stderr),
            }));
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            // The readers are left to finish on their own: a grandchild (the
            // PyInstaller bootloader starts one) may still hold the pipes.
            return Ok(None);
        }
        thread::sleep(POLL_INTERVAL);
    }
}

fn drain(mut pipe: impl Read + Send + 'static) -> JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = pipe.read_to_end(&mut buffer);
        buffer
    })
}

fn collect(reader: Option<JoinHandle<Vec<u8>>>) -> Vec<u8> {
    reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
}

/// Runs blocking work (child processes, file I/O) off the async runtime's
/// worker threads, so a slow child cannot stall other commands.
pub async fn run_blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| format!("Hintergrundaufgabe abgebrochen: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Stdio;

    fn spawn_piped(command: &mut Command) -> Child {
        command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap()
    }

    #[cfg(windows)]
    fn long_running() -> Command {
        let mut command = background_command("ping");
        command.args(["-n", "30", "127.0.0.1"]);
        command
    }

    #[cfg(not(windows))]
    fn long_running() -> Command {
        let mut command = Command::new("sleep");
        command.arg("30");
        command
    }

    #[cfg(windows)]
    fn echo_hello() -> Command {
        let mut command = background_command("cmd");
        command.args(["/C", "echo hello"]);
        command
    }

    #[cfg(not(windows))]
    fn echo_hello() -> Command {
        let mut command = Command::new("echo");
        command.arg("hello");
        command
    }

    #[test]
    fn a_child_that_finishes_in_time_returns_its_output() {
        let child = spawn_piped(&mut echo_hello());

        let output = output_within(child, Duration::from_secs(20))
            .unwrap()
            .unwrap();

        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("hello"));
    }

    #[test]
    fn a_child_that_runs_too_long_is_killed() {
        let child = spawn_piped(&mut long_running());
        let started = Instant::now();

        let output = output_within(child, Duration::from_millis(300)).unwrap();

        assert!(output.is_none());
        assert!(started.elapsed() < Duration::from_secs(10));
    }
}
