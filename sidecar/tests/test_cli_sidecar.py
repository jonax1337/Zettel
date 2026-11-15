"""How cli/zettel.py finds and talks to the sidecar."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

CLI_PATH = Path(__file__).resolve().parents[2] / "cli" / "zettel.py"
MAIN_PY = CLI_PATH.parents[1] / "sidecar" / "main.py"


@pytest.fixture
def cli():
    # cli/ is not gitignored, so importing it must not leave a __pycache__ behind.
    previous, sys.dont_write_bytecode = sys.dont_write_bytecode, True
    try:
        spec = importlib.util.spec_from_file_location("zettel_cli_sidecar", CLI_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


def existing_file(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"")
    return path


@pytest.mark.parametrize("name", ["python.exe", "python", "python3.12", "Python.exe"])
def test_a_python_interpreter_from_the_environment_runs_main_py(cli, tmp_path, monkeypatch, name):
    interpreter = existing_file(tmp_path / name)
    monkeypatch.setenv("ZETTEL_SIDECAR", str(interpreter))

    assert cli.resolve_sidecar() == (str(interpreter), str(MAIN_PY))


@pytest.mark.parametrize("name", ["zettel-sidecar.exe", "zettel-sidecar"])
def test_a_sidecar_binary_from_the_environment_runs_on_its_own(cli, tmp_path, monkeypatch, name):
    binary = existing_file(tmp_path / name)
    monkeypatch.setenv("ZETTEL_SIDECAR", str(binary))

    assert cli.resolve_sidecar() == (str(binary), None)


def test_the_repo_venv_on_windows_is_an_interpreter_not_a_sidecar_binary(cli, tmp_path, monkeypatch):
    venv_python = existing_file(tmp_path / ".venv" / "Scripts" / "python.exe")
    monkeypatch.delenv("ZETTEL_SIDECAR", raising=False)
    monkeypatch.setattr(cli, "SIDECAR_SEARCH_PATHS", [venv_python])

    assert cli.resolve_sidecar() == (str(venv_python), str(MAIN_PY))


def test_an_installed_sidecar_wins_over_the_repo_venv(cli, tmp_path, monkeypatch):
    installed = existing_file(tmp_path / "Zettel" / "sidecar" / "zettel-sidecar.exe")
    venv_python = existing_file(tmp_path / ".venv" / "Scripts" / "python.exe")
    monkeypatch.delenv("ZETTEL_SIDECAR", raising=False)
    monkeypatch.setattr(cli, "SIDECAR_SEARCH_PATHS", [installed, venv_python])

    assert cli.resolve_sidecar() == (str(installed), None)


def use_script_as_sidecar(cli, monkeypatch, tmp_path, source: str) -> None:
    script = tmp_path / "fake_sidecar.py"
    script.write_text(source, encoding="utf-8")
    monkeypatch.setattr(cli, "resolve_sidecar", lambda: (sys.executable, str(script)))


def test_the_answer_of_the_sidecar_is_read_as_utf8(cli, tmp_path, monkeypatch):
    pdf_path = "C:/Users/Jörg/Dokumente/Zettel/Żółć.pdf"
    use_script_as_sidecar(
        cli, monkeypatch, tmp_path,
        "import json, sys\n"
        f"answer = json.dumps({{'success': True, 'pdfPath': {pdf_path!r}}}, ensure_ascii=False)\n"
        "sys.stdout.buffer.write(answer.encode('utf-8'))\n",
    )

    assert cli.call_sidecar("generate_invoice", {})["pdfPath"] == pdf_path


def test_a_crash_message_in_the_code_page_is_still_reported(cli, tmp_path, monkeypatch):
    use_script_as_sidecar(
        cli, monkeypatch, tmp_path,
        "import sys\n"
        "sys.stderr.buffer.write('Datei C:/Users/Jörg/x.pdf fehlt'.encode('cp1252'))\n"
        "sys.exit(1)\n",
    )

    with pytest.raises(SystemExit, match=r"Sidecar-Fehler \(exit 1\):\s+Datei C:/Users/J.rg/x.pdf fehlt"):
        cli.call_sidecar("generate_invoice", {})
