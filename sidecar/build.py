"""
Build the Zettel sidecar as a standalone executable via PyInstaller.

Usage (from sidecar/, with the venv activated):
    python build.py

Output:
    sidecar/dist/zettel-sidecar/zettel-sidecar(.exe)  -- run this directly.
    On Windows the GTK3 runtime DLLs required by WeasyPrint are copied next to
    the executable so the bundle works on machines without GTK installed.

Layout (onedir):
    dist/zettel-sidecar/
        zettel-sidecar.exe
        _internal/...           # PyInstaller bootloader payload
        templates/...           # Jinja templates (added via --add-data)
        *.dll                   # GTK runtime (Windows only)
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
BUILD = ROOT / "build"
SPEC = ROOT / "zettel-sidecar.spec"
APP_NAME = "zettel-sidecar"

# Sentinel DLL: if this is present, we accept the directory as a GTK runtime.
# WeasyPrint pulls in a long transitive dep chain (varies by GTK build —
# gtk3-classic uses libffi-7/libtiff-5; the official MSI uses -8/-6). Rather
# than maintain a brittle allow-list, copy every .dll from the GTK dir.
GTK_SENTINEL_DLL = "libgobject-2.0-0.dll"

GTK_SEARCH_PATHS = [
    os.environ.get("ZETTEL_GTK_PATH"),
    r"C:\Program Files\GTK3-Runtime Win64\bin",
    r"C:\Program Files\GTK3-Runtime Win64",
]


def clean() -> None:
    for path in (DIST, BUILD, SPEC):
        if path.is_dir():
            shutil.rmtree(path)
        elif path.is_file():
            path.unlink()


def run_pyinstaller() -> None:
    sep = ";" if sys.platform == "win32" else ":"
    args = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--console",
        "--name", APP_NAME,
        "--add-data", f"templates{sep}templates",
        "--collect-all", "weasyprint",
        "--collect-all", "facturx",
        "--collect-data", "iso4217",
        "--collect-data", "stdnum",
        "--collect-data", "tzdata",
        "--collect-all", "pydyf",
        "--collect-all", "fontTools",
        "--collect-all", "typst",
        "--collect-submodules", "jinja2",
        "--hidden-import", "lxml",
        "--hidden-import", "lxml.etree",
        "main.py",
    ]
    print(">>", " ".join(args))
    subprocess.run(args, cwd=ROOT, check=True)


STRAY_FILE_PATTERNS = ("err.log", "test-output.pdf", "*.tmp")


def remove_stray_files() -> None:
    """Remove smoke-test artifacts that get left in dist/ when running the
    bundled exe interactively. Otherwise they end up shipped in the installer."""
    bundle_dir = DIST / APP_NAME
    if not bundle_dir.is_dir():
        return
    for pattern in STRAY_FILE_PATTERNS:
        for p in bundle_dir.glob(pattern):
            p.unlink()


def find_gtk_dir() -> Path:
    for candidate in GTK_SEARCH_PATHS:
        if candidate and (Path(candidate) / GTK_SENTINEL_DLL).exists():
            return Path(candidate)
    raise SystemExit(
        "GTK3 runtime not found. Install GTK3-Runtime Win64 or set "
        "ZETTEL_GTK_PATH to its bin directory."
    )


def copy_gtk_dlls() -> None:
    if sys.platform != "win32":
        return
    bundle_dir = DIST / APP_NAME
    if not bundle_dir.is_dir():
        raise SystemExit(f"PyInstaller output not found at {bundle_dir}")

    src_dir = find_gtk_dir()
    print(f">> Copying GTK DLLs from {src_dir}")

    dlls = list(src_dir.glob("*.dll"))
    for src in dlls:
        shutil.copy2(src, bundle_dir / src.name)
    print(f">> {len(dlls)} GTK DLLs copied")


def main() -> int:
    if "--clean" in sys.argv:
        clean()
        print(">> Cleaned dist/build/spec")
        return 0

    run_pyinstaller()
    copy_gtk_dlls()
    remove_stray_files()

    exe = DIST / APP_NAME / (f"{APP_NAME}.exe" if sys.platform == "win32" else APP_NAME)
    print(f"\n>> Done. Bundle: {DIST / APP_NAME}\n>> Entry:  {exe}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
