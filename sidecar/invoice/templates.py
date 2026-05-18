"""Jinja2 environment + helpers shared between renderers."""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader


def _templates_dir() -> Path:
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


def fmt_qty(q: float | int) -> str:
    if float(q).is_integer():
        return str(int(q))
    return f"{q:.2f}".replace(".", ",")


def fmt_date_unix(unix_seconds: int | None) -> str:
    if not unix_seconds:
        return ""
    dt = datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc)
    return dt.strftime("%d.%m.%Y")


def build_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(_templates_dir())),
        # Always autoescape — our templates are .xml.j2 / .html.j2, and
        # select_autoescape() only inspects the *last* extension, missing both.
        autoescape=True,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["eur"] = cents_to_eur
    env.filters["qty"] = fmt_qty
    env.filters["date_unix"] = fmt_date_unix
    return env
