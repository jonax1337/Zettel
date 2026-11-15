// Rebuilds the PyInstaller sidecar before `pnpm tauri:build`. Tauri only copies
// sidecar/dist, so without this step a stale build from an older commit ends up
// in the installer. CI builds the sidecar itself and calls `tauri build` directly.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const win = process.platform === "win32";
const sidecar = join(dirname(fileURLToPath(import.meta.url)), "..", "sidecar");

function fail(message) {
  console.error(`\nSidecar build failed: ${message}`);
  process.exit(1);
}

// No fallback to `python` from PATH: on Windows that is often the Store alias,
// and an interpreter without the sidecar's packages still "builds" (PyInstaller
// only warns on --collect-all), shipping a sidecar that cannot render PDFs.
const venvPython = join(sidecar, ".venv", win ? "Scripts/python.exe" : "bin/python");
const python = process.env.ZETTEL_PYTHON || venvPython;
if (!process.env.ZETTEL_PYTHON && !existsSync(venvPython)) {
  fail(
    `no Python at ${python}. Create sidecar/.venv (pip install -r requirements.txt ` +
      "pyinstaller==6.22.3) or set ZETTEL_PYTHON.",
  );
}

console.log(`>> ${python} build.py`);
const build = spawnSync(python, ["build.py"], { cwd: sidecar, stdio: "inherit" });
if (build.error || build.status !== 0) {
  fail(build.error?.message ?? "sidecar/build.py exited with an error (see above).");
}

// Smoke test: main.py imports WeasyPrint at startup, so a bundle missing modules
// or the Pango/GTK libraries fails here instead of in the installed app.
const exe = join(sidecar, "dist", "zettel-sidecar", win ? "zettel-sidecar.exe" : "zettel-sidecar");
const ping = spawnSync(exe, [], {
  input: '{"command":"ping"}\n',
  encoding: "utf8",
  timeout: 60_000,
});
if (!ping.stdout?.includes('"pong": true')) {
  fail(`the built sidecar does not answer ping.\n${ping.stderr || ping.error?.message || ""}`);
}
console.log(">> Sidecar answers ping");
