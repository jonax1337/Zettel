// Rebuilds the PyInstaller sidecar and CLI before `pnpm tauri:build`. Tauri only
// copies sidecar/dist and cli/dist, so without this step a stale build from an
// older commit ends up in the installer (or none, and the build fails).
// CI builds both itself and calls `tauri build` directly.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const win = process.platform === "win32";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sidecar = join(root, "sidecar");
const cli = join(root, "cli");

function fail(message) {
  console.error(`\nBundled Python build failed: ${message}`);
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

function runBuild(script, cwd) {
  console.log(`>> ${python} ${script}`);
  const build = spawnSync(python, [script], { cwd, stdio: "inherit" });
  if (build.error || build.status !== 0) {
    fail(build.error?.message ?? `${script} exited with an error (see above).`);
  }
}

function smokeTest(exe, args, input, expected, what) {
  const run = spawnSync(exe, args, { input, encoding: "utf8", timeout: 60_000 });
  if (!run.stdout?.includes(expected)) {
    fail(`the built ${what} does not answer.\n${run.stderr || run.error?.message || ""}`);
  }
  console.log(`>> ${what} answers`);
}

runBuild("build.py", sidecar);
// main.py imports WeasyPrint at startup, so a bundle missing modules or the
// Pango/GTK libraries fails here instead of in the installed app.
const sidecarExe = join(sidecar, "dist", "zettel-sidecar", win ? "zettel-sidecar.exe" : "zettel-sidecar");
smokeTest(sidecarExe, [], '{"command":"ping"}\n', '"pong": true', "sidecar");

runBuild(join(cli, "build.py"), root);
const cliExe = join(cli, "dist", win ? "zettel-cli.exe" : "zettel-cli");
smokeTest(cliExe, ["--version"], "", "zettel-cli", "CLI");
