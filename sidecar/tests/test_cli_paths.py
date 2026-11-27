"""PDF output folders of cli/zettel.py, which must match src-tauri/src/tenants.rs active_documents_root()."""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

CLI_PATH = Path(__file__).resolve().parents[2] / "cli" / "zettel.py"


def load_cli():
    # cli/ is not gitignored, so importing it must not leave a __pycache__ behind.
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec = importlib.util.spec_from_file_location("zettel_cli_paths", CLI_PATH)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


@pytest.fixture
def cli(tmp_path, monkeypatch):
    module = load_cli()
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setattr(module, "app_data_dir", lambda: data)
    monkeypatch.setattr(module, "documents_dir", lambda: tmp_path / "Dokumente")
    return module


def write_active_tenant(cli, tenant_id: str) -> None:
    config = {"active": tenant_id, "tenants": [{"id": tenant_id, "label": "Firma B", "path": "D:/b.db"}]}
    (cli.app_data_dir() / "tenants.json").write_text(json.dumps(config), encoding="utf-8")


def test_production_pdfs_go_to_zettel(cli, tmp_path):
    assert cli.pdf_output_dir() == tmp_path / "Dokumente" / "Zettel" / "Rechnungen"


def test_sandbox_pdfs_are_kept_apart_from_production(cli, tmp_path):
    write_active_tenant(cli, "t1")
    (cli.app_data_dir() / "sandbox.flag").write_text("1")
    assert cli.pdf_output_dir() == tmp_path / "Dokumente" / "Zettel-Sandbox" / "Rechnungen"


def test_custom_tenant_pdfs_get_their_own_folder(cli, tmp_path):
    write_active_tenant(cli, "t1712345")
    assert cli.pdf_output_dir() == tmp_path / "Dokumente" / "Zettel" / "Mandanten" / "t1712345" / "Rechnungen"


def test_tenant_db_path_still_resolves(cli):
    write_active_tenant(cli, "t1")
    assert cli.resolve_db_path() == Path("D:/b.db")


def test_archive_moves_the_current_pdf_into_versions(cli, tmp_path):
    pdf = tmp_path / "Rechnungen" / "RE-1.pdf"
    pdf.parent.mkdir(parents=True)
    pdf.write_bytes(b"v1")

    archived = Path(cli.archive_pdf_version(pdf, pdf))

    assert not pdf.exists()
    assert archived.parent == pdf.parent / "Versionen"
    assert archived.name.startswith("RE-1__") and not archived.stem.endswith("-2")
    assert archived.read_bytes() == b"v1"


def test_a_pdf_stored_in_a_previous_root_joins_the_new_version_chain(cli, tmp_path):
    legacy = tmp_path / "home" / "Documents" / "Zettel" / "Rechnungen" / "RE-1.pdf"
    legacy_versions = legacy.parent / "Versionen"
    legacy_versions.mkdir(parents=True)
    legacy.write_bytes(b"issued")
    (legacy_versions / "RE-1__100.pdf").write_bytes(b"first")
    (legacy_versions / "RE-2__100.pdf").write_bytes(b"other invoice")
    target = tmp_path / "Dokumente" / "Zettel" / "Rechnungen" / "RE-1.pdf"

    cli.archive_pdf_version(target, legacy)

    adopted = sorted(p.read_bytes() for p in (target.parent / "Versionen").glob("RE-1__*.pdf"))
    assert adopted == [b"first", b"issued"]
    assert not legacy.exists()
    assert (legacy_versions / "RE-2__100.pdf").exists()


RENDER_FAILURE = {"success": False, "error": {"code": "RENDER_FAILED", "message": "x", "details": ""}}


def test_a_failed_render_puts_the_archived_pdf_back(cli, tmp_path, monkeypatch):
    pdf = tmp_path / "Rechnungen" / "RE-1.pdf"
    pdf.parent.mkdir(parents=True)
    pdf.write_bytes(b"issued")

    def leave_a_broken_file_and_fail(command, payload):
        pdf.write_bytes(b"half written")
        return RENDER_FAILURE

    monkeypatch.setattr(cli, "call_sidecar", leave_a_broken_file_and_fail)

    with pytest.raises(SystemExit, match="RENDER_FAILED"):
        cli.render_replacing_pdf("generate_invoice", {}, pdf, str(pdf))

    assert pdf.read_bytes() == b"issued"
    assert list((pdf.parent / "Versionen").iterdir()) == []


def test_a_failed_first_render_has_nothing_to_put_back(cli, tmp_path, monkeypatch):
    pdf = tmp_path / "Rechnungen" / "RE-1.pdf"
    monkeypatch.setattr(cli, "call_sidecar", lambda command, payload: RENDER_FAILURE)

    with pytest.raises(SystemExit, match="RENDER_FAILED"):
        cli.render_replacing_pdf("generate_invoice", {}, pdf, None)

    assert not pdf.exists()


def test_a_successful_render_keeps_the_previous_pdf_as_a_version(cli, tmp_path, monkeypatch):
    pdf = tmp_path / "Rechnungen" / "RE-1.pdf"
    pdf.parent.mkdir(parents=True)
    pdf.write_bytes(b"v1")
    monkeypatch.setattr(cli, "call_sidecar", lambda command, payload: {"success": True, "pdfPath": str(pdf)})

    assert cli.render_replacing_pdf("generate_invoice", {}, pdf, str(pdf)) == str(pdf)

    assert [p.read_bytes() for p in (pdf.parent / "Versionen").iterdir()] == [b"v1"]


def test_xdg_documents_dir_is_read_from_user_dirs(tmp_path, monkeypatch):
    (tmp_path / "user-dirs.dirs").write_text('XDG_DOCUMENTS_DIR="$HOME/Dokumente"\n', encoding="utf-8")
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    assert load_cli()._xdg_documents_dir() == Path.home() / "Dokumente"


@pytest.mark.skipif(sys.platform != "win32", reason="Known Folder lookup is Windows-only")
def test_windows_documents_dir_comes_from_the_known_folder():
    documents = load_cli()._windows_documents_dir()
    assert documents is not None and documents.is_absolute() and documents.is_dir()
