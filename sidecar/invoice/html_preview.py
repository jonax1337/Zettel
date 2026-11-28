"""Render a document as one self-contained HTML sheet for the on-screen preview.

The sheet comes from the same templates and stylesheet as the PDF; only a screen
stylesheet (preview.css) recreates the page geometry WeasyPrint gets from @page.
Nothing here may import WeasyPrint: the sidecar starts once per call.
"""
from __future__ import annotations

from typing import Any, Callable

from .pdf import render_invoice_html, render_offer_html, render_reminder_html
from .templates import templates_dir

PDF_STYLESHEET = "invoice.css"
PREVIEW_STYLESHEET = "preview.css"

_RENDERERS: dict[str, Callable[[dict[str, Any]], str]] = {
    "invoice": render_invoice_html,
    "offer": render_offer_html,
    "reminder": render_reminder_html,
}
DOCUMENT_KINDS = tuple(_RENDERERS)


def _inline_stylesheets(html: str) -> str:
    css = "\n".join(
        (templates_dir() / name).read_text(encoding="utf-8")
        for name in (PDF_STYLESHEET, PREVIEW_STYLESHEET)
    )
    return html.replace("</head>", f"<style>\n{css}\n</style>\n</head>", 1)


def render_document_html(kind: str, payload: dict[str, Any]) -> str:
    """HTML of one document kind with both stylesheets inlined; nothing is written to disk."""
    return _inline_stylesheets(_RENDERERS[kind](payload))
