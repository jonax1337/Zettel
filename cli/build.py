"""
Build the Zettel CLI as a single-file executable (stdlib only, ~10 MB).

Usage (from the repo root, with pyinstaller installed):
    python cli/build.py

Output: cli/dist/zettel-cli(.exe), bundled by tauri.bundle.conf.json to <install>/cli/.
At runtime the frozen CLI finds the PDF sidecar at ../sidecar/ (see resolve_sidecar).
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

for d in (ROOT / "dist", ROOT / "build"):
    shutil.rmtree(d, ignore_errors=True)

subprocess.run(
    [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--console",
        "--name", "zettel-cli", "--specpath", str(ROOT / "build"), "--workpath", str(ROOT / "build"),
        "--distpath", str(ROOT / "dist"), str(ROOT / "zettel.py"),
    ],
    check=True,
)
