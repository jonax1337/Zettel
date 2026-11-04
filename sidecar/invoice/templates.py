"""Jinja2 environment + helpers shared between renderers."""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup, escape

from .i18n import t as translate


DISPLAY_DATE_FORMAT = "%d.%m.%Y"

# The app stores calendar dates as local midnight (CLI: local noon), so they
# must be read back in the same zone; UTC would shift them one day early.
DOCUMENT_TIMEZONE = ZoneInfo("Europe/Berlin")


def templates_dir() -> Path:
    # When frozen by PyInstaller, templates ship next to the binary in _MEIPASS.
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "templates"  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent.parent / "templates"


_CURRENCY_SYMBOLS = {"EUR": "€", "USD": "$", "GBP": "£", "JPY": "¥"}


def cents_to_eur(cents: int | float | None, currency: str | None = "EUR") -> str:
    code = (currency or "EUR").upper()
    suffix = _CURRENCY_SYMBOLS.get(code, code)
    if cents is None:
        return f"0,00 {suffix}"
    value = float(cents) / 100
    s = f"{value:,.2f}"
    # de-DE: . as thousand sep, , as decimal sep — swap from en formatting.
    return s.replace(",", "X").replace(".", ",").replace("X", ".") + f" {suffix}"


def fmt_iban(iban: str | None) -> Markup:
    """Groups of four as inline-blocks, so the text stays one unbroken IBAN when copied."""
    s = "".join(ch for ch in iban or "" if ch.isalnum()).upper()
    return Markup("").join(Markup('<span class="iban-g">{}</span>').format(s[i : i + 4]) for i in range(0, len(s), 4))


def fmt_qty(q: float | int) -> str:
    if float(q).is_integer():
        return str(int(q))
    return f"{q:.2f}".replace(".", ",")


def fmt_rate(rate: float | int) -> str:
    return f"{rate:g}".replace(".", ",")


def nl2br(text: str | None) -> Markup:
    """Escape user text and turn line breaks into <br>."""
    return escape(text or "").replace("\n", Markup("<br>"))


def format_unix_local(unix_seconds: int | None, pattern: str) -> str:
    if not unix_seconds:
        return ""
    return datetime.fromtimestamp(int(unix_seconds), tz=DOCUMENT_TIMEZONE).strftime(pattern)


def fmt_date_unix(unix_seconds: int | None) -> str:
    return format_unix_local(unix_seconds, DISPLAY_DATE_FORMAT)


def build_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(templates_dir())),
        # Always autoescape — our templates are .xml.j2 / .html.j2, and
        # select_autoescape() only inspects the *last* extension, missing both.
        autoescape=True,
        finalize=lambda v: "" if v is None else v,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["eur"] = cents_to_eur
    env.filters["qty"] = fmt_qty
    env.filters["rate"] = fmt_rate
    env.filters["nl2br"] = nl2br
    env.filters["iban"] = fmt_iban
    env.filters["date_unix"] = fmt_date_unix
    # `t()` ist als globale Funktion verfügbar; Templates rufen
    # {{ t('schluessel', language) }} oder mit kwargs für Interpolation.
    env.globals["t"] = translate
    return env
