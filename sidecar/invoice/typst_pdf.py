"""Render a document view (see `document_view.py`) to PDF/A-3b with Typst."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from typing import Any

from .templates import templates_dir

TYPST_TEMPLATE = "document.typ"
# Same archival standard as the WeasyPrint path; the Factur-X step that embeds
# the invoice XML afterwards requires a PDF/A-3 base.
PDF_STANDARD = "a-3b"
LOGO_STEM = "logo"
SVG_SNIFF_BYTES = 1024

# Typst picks the decoder from the file extension, so the logo is staged under
# the extension of its actual content; a misnamed file would fail otherwise.
_IMAGE_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpg"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
)


class TypstRenderError(RuntimeError):
    pass


def render_typst_pdf(view: dict[str, Any], logo_path: str | None) -> bytes:
    with tempfile.TemporaryDirectory(prefix="zettel-typst-") as root:
        logo = _stage_logo(logo_path, Path(root))
        try:
            return _compile(view, root, logo)
        except TypstRenderError:
            if logo is None:
                raise
        # The logo is decoration: like the WeasyPrint path, an unreadable one is
        # left out rather than blocking the invoice.
        print(f"Logo nicht lesbar, PDF ohne Logo erzeugt: {logo_path}", file=sys.stderr)
        return _compile(view, root, None)


def _compile(view: dict[str, Any], root: str, logo: str | None) -> bytes:
    import typst  # imported lazily so WeasyPrint-only runs don't load the compiler

    template = (templates_dir() / TYPST_TEMPLATE).read_bytes()
    try:
        return typst.compile(
            template,
            root=root,
            sys_inputs={"data": json.dumps({**view, "logo": logo}, ensure_ascii=False)},
            pdf_standards=[PDF_STANDARD],
        )
    except typst.TypstError as e:
        raise TypstRenderError(f"Typst konnte das PDF nicht setzen: {e}") from e


def _stage_logo(logo_path: str | None, root: Path) -> str | None:
    """Copy the logo into the compile root, the only place Typst reads files from.

    Users pick logos from arbitrary folders (Pictures, OneDrive, network shares),
    so the path is resolved here rather than handed to the template."""
    if not logo_path:
        return None
    source = Path(logo_path).expanduser()
    if not source.is_file():
        return None
    data = source.read_bytes()
    image_format = _image_format(data)
    if image_format is None:
        return None
    staged = root / f"{LOGO_STEM}.{image_format}"
    staged.write_bytes(data)
    return f"/{staged.name}"


def _image_format(data: bytes) -> str | None:
    for signature, image_format in _IMAGE_SIGNATURES:
        if data.startswith(signature):
            return image_format
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if b"<svg" in data[:SVG_SNIFF_BYTES]:
        return "svg"
    return None
