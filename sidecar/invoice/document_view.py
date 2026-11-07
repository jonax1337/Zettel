"""Renderer-neutral content of the invoice, offer and reminder PDFs.

The Typst template lays out what this module decides: which meta rows,
totals, notices and blocks a document shows, translated and formatted with the
same helpers the Jinja templates use. It mirrors those templates
(`invoice.html.j2`, `offer.html.j2`, `reminder.html.j2`); the renderer parity
test compares the text of both renderers' PDFs, so a change to one side that
the other lacks fails there.
"""
from __future__ import annotations

from typing import Any

from .i18n import t
from .qr import epc_qr_svg, invoice_epc_payload
from .templates import cents_to_eur, fmt_date_unix, fmt_qty, fmt_rate, iban_groups
from .vat import open_balance_cent, signed_paid_cent, vat_groups

DEFAULT_LANGUAGE = "de"
DEFAULT_THEME = "classic"
HOME_COUNTRY = "DE"
DATE_RANGE_SEPARATOR = " – "
CREDIT_NOTE_SIGN = -1
SKONTO_PERCENT_FORMAT = "%.1f"

# The reminder template is German only (see reminder.html.j2).
REMINDER_LANGUAGE = "de"


def invoice_view(payload: dict[str, Any]) -> dict[str, Any]:
    invoice, company, customer = payload["invoice"], payload["company"], payload["customer"]
    lang = invoice.get("pdfLanguage") or DEFAULT_LANGUAGE
    is_credit_note = bool(invoice.get("isCreditNote"))
    sign = CREDIT_NOTE_SIGN if is_credit_note else 1
    title = t("doctype_credit_note" if is_credit_note else "doctype_invoice", lang)
    return {
        **_frame(payload, lang, title, invoice["number"]),
        "footer": _company_footer(company, lang, with_bank=True),
        "topCallouts": _credit_note_reference(invoice, lang),
        "recipient": _recipient(customer, t("addr_attention", lang)),
        "meta": _invoice_meta(invoice, customer, lang),
        "intro": [],
        "table": _items_table(payload["items"], invoice, lang, sign),
        "totals": _totals(invoice, payload["items"], lang, sign) + _payment_rows(invoice, lang),
        "callouts": _tax_notices(invoice, company, lang),
        "payment": _invoice_payment(invoice, company, lang),
        "blocks": _invoice_blocks(invoice, lang),
    }


def offer_view(payload: dict[str, Any]) -> dict[str, Any]:
    offer, company, customer = payload["offer"], payload["company"], payload["customer"]
    lang = offer.get("pdfLanguage") or DEFAULT_LANGUAGE
    return {
        **_frame(payload, lang, t("doctype_offer", lang), offer["number"]),
        "footer": _company_footer(company, lang, with_bank=False),
        "topCallouts": [],
        "recipient": _recipient(customer, t("addr_attention", lang)),
        "meta": _offer_meta(offer, customer, lang),
        "intro": [offer["introText"]] if offer.get("introText") else [],
        "table": _items_table(payload["items"], offer, lang, 1),
        "totals": _totals(offer, payload["items"], lang, 1),
        "callouts": _offer_notices(offer, company, lang),
        "payment": None,
        "blocks": _offer_blocks(offer, lang),
    }


def reminder_view(payload: dict[str, Any]) -> dict[str, Any]:
    reminder, invoice, company = payload["reminder"], payload["invoice"], payload["company"]
    currency = invoice.get("currency")
    label = reminder["levelLabel"]
    return {
        **_frame(payload, REMINDER_LANGUAGE, label, reminder["number"]),
        "footer": _reminder_footer(company),
        "topCallouts": [],
        "recipient": _recipient(payload["customer"], "z. Hd."),
        "meta": [
            _row(f"{label}-Nr.", reminder["number"]),
            _row("Datum", fmt_date_unix(reminder["issueDate"])),
            _row("Neue Frist", fmt_date_unix(reminder["dueDate"])),
        ],
        "intro": ["Sehr geehrte Damen und Herren,", reminder.get("bodyText") or ""],
        "table": _reminder_table(reminder, invoice, currency),
        "totals": _reminder_totals(reminder, currency),
        "callouts": [],
        "payment": None,
        "blocks": _reminder_blocks(reminder, invoice, company),
    }


# ----- shared frame ---------------------------------------------------------


def _frame(payload: dict[str, Any], lang: str, title: str, number: str) -> dict[str, Any]:
    company = payload["company"]
    settings = payload.get("settings") or {}
    return {
        "lang": lang,
        "theme": settings.get("pdf_theme") or DEFAULT_THEME,
        "title": title,
        "number": number,
        "pageLabel": t("page_n_of_m", lang),
        "company": {"name": company.get("companyName") or "", "owner": company.get("ownerName") or None},
        "senderLine": _sender_line(company),
    }


def _row(label: str, value: str) -> dict[str, str]:
    return {"label": label, "value": value}


def _date_range(start: int, end: int) -> str:
    return fmt_date_unix(start) + DATE_RANGE_SEPARATOR + fmt_date_unix(end)


def _postal_line(party: dict[str, Any]) -> str:
    return f"{party.get('postalCode') or ''} {party.get('city') or ''}".strip()


def _sender_line(company: dict[str, Any]) -> str:
    parts = [company.get("companyName") or ""]
    if company.get("street"):
        parts.append(company["street"])
    if company.get("postalCode"):
        parts.append(_postal_line(company))
    return " · ".join(parts)


def _recipient(customer: dict[str, Any], attention_label: str) -> dict[str, Any]:
    lines = []
    if customer.get("contactPerson"):
        lines.append(f"{attention_label} {customer['contactPerson']}")
    lines += [customer.get("street"), _postal_line(customer)]
    if customer.get("country") and customer["country"] != HOME_COUNTRY:
        lines.append(customer["country"])
    return {"name": customer.get("name") or "", "lines": [line for line in lines if line]}


def _footer_column(title: str | None, lines: list[str | None], *, mono_line: str | None = None,
                   wide: bool = False) -> dict[str, Any]:
    """`mono_line` names the one line set in a monospace font (the IBAN)."""
    return {
        "title": title,
        "lines": [{"text": line, "mono": line == mono_line} for line in lines if line],
        "wide": wide,
    }


def _company_footer(company: dict[str, Any], lang: str, *, with_bank: bool) -> list[dict[str, Any]]:
    tax_no, vat_id = company.get("taxNumber"), company.get("vatId")
    columns = [
        _footer_column(company.get("companyName") or "",
                       [company.get("ownerName"), company.get("street"), _postal_line(company)]),
        _footer_column(t("footer_contact", lang), [company.get("email"), company.get("phone"), company.get("website")]),
        _footer_column(t("footer_tax", lang), [
            f"{t('footer_tax_no', lang)} {tax_no}" if tax_no else None,
            f"{t('footer_vat_id', lang)} {vat_id}" if vat_id else None,
        ]),
    ]
    if with_bank:
        iban = " ".join(iban_groups(company.get("bankIban")))
        columns.append(_footer_column(t("footer_bank", lang),
                                      [company.get("bankName"), iban, company.get("bankBic")],
                                      mono_line=iban, wide=True))
    return columns


def _reminder_footer(company: dict[str, Any]) -> list[dict[str, Any]]:
    owner = company.get("ownerName")
    tax_no, vat_id = company.get("taxNumber"), company.get("vatId")
    return [_footer_column(None, [
        (company.get("companyName") or "") + (f" · {owner}" if owner else ""),
        f"Steuernr.: {tax_no}" if tax_no else None,
        f"USt-IdNr.: {vat_id}" if vat_id else None,
    ])]


# ----- invoice & offer ------------------------------------------------------


def _shows_vat(doc: dict[str, Any]) -> bool:
    return not doc.get("isKleinunternehmer") and not doc.get("isReverseCharge")


def _invoice_meta(invoice: dict[str, Any], customer: dict[str, Any], lang: str) -> list[dict[str, str]]:
    rows = [
        _row(t("meta_invoice_no", lang), invoice["number"]),
        _row(t("meta_issue_date", lang), fmt_date_unix(invoice.get("issueDate"))),
    ]
    if invoice.get("servicePeriodStart") and invoice.get("servicePeriodEnd"):
        rows.append(_row(t("meta_service_period", lang),
                         _date_range(invoice["servicePeriodStart"], invoice["servicePeriodEnd"])))
    elif invoice.get("deliveryDate"):
        rows.append(_row(t("meta_delivery_date", lang), fmt_date_unix(invoice["deliveryDate"])))
    if not invoice.get("isCreditNote"):
        rows.append(_row(t("meta_due_date", lang), fmt_date_unix(invoice.get("dueDate"))))
    if customer.get("vatId"):
        rows.append(_row(t("meta_customer_vatid", lang), customer["vatId"]))
    return rows


def _offer_meta(offer: dict[str, Any], customer: dict[str, Any], lang: str) -> list[dict[str, str]]:
    rows = [
        _row(t("meta_offer_no", lang), offer["number"]),
        _row(t("meta_offer_date", lang), fmt_date_unix(offer.get("issueDate"))),
        _row(t("meta_valid_until", lang), fmt_date_unix(offer.get("validUntil"))),
    ]
    if offer.get("servicePeriodStart") and offer.get("servicePeriodEnd"):
        rows.append(_row(t("meta_service_period", lang),
                         _date_range(offer["servicePeriodStart"], offer["servicePeriodEnd"])))
    if customer.get("vatId"):
        rows.append(_row(t("meta_customer_vatid", lang), customer["vatId"]))
    return rows


def _item_period(item: dict[str, Any], lang: str) -> str | None:
    start, end = item.get("linePeriodStart"), item.get("linePeriodEnd")
    if not (start and end):
        return None
    if start == end:
        return f"{t('item_period_single', lang)} {fmt_date_unix(start)}"
    return f"{t('item_period_range', lang)} {_date_range(start, end)}"


def _items_table(items: list[dict[str, Any]], doc: dict[str, Any], lang: str, sign: int) -> dict[str, Any]:
    currency = doc.get("currency")
    columns = [
        {"key": "pos", "label": t("col_pos", lang), "align": "right", "muted": True},
        {"key": "description", "label": t("col_desc", lang), "align": "left"},
        {"key": "qty", "label": t("col_qty", lang), "align": "right"},
        {"key": "unit", "label": t("col_unit", lang), "align": "left"},
        {"key": "price", "label": t("col_price", lang), "align": "right"},
    ]
    if _shows_vat(doc):
        columns.append({"key": "vat", "label": t("col_vat", lang), "align": "right"})
    columns.append({"key": "total", "label": t("col_total", lang), "align": "right", "strong": True})
    rows = [
        {
            "pos": str(it.get("position", "")),
            "description": it.get("description") or "",
            "detail": it.get("longDescription") or None,
            "period": _item_period(it, lang),
            "qty": fmt_qty(it.get("quantity") or 0),
            "unit": it.get("unit") or "",
            "price": cents_to_eur(it.get("unitPrice"), currency),
            "vat": "" if it.get("vatRate") is None else str(it["vatRate"]),
            "total": cents_to_eur((it.get("lineTotal") or 0) * sign, currency),
        }
        for it in items
    ]
    return {"title": None, "columns": columns, "rows": rows}


def _total(label: str, value: str, kind: str = "row") -> dict[str, str]:
    return {"label": label, "value": value, "kind": kind}


def _totals(doc: dict[str, Any], items: list[dict[str, Any]], lang: str, sign: int) -> list[dict[str, str]]:
    currency = doc.get("currency")
    rows = [_total(t("totals_subtotal", lang), cents_to_eur(doc.get("subtotal"), currency))]
    if _shows_vat(doc):
        groups = vat_groups(items, bool(doc.get("isKleinunternehmer")), sign)
        for group in groups:
            rate = fmt_rate(group["rate"])
            if len(groups) > 1:
                rows.append(_total(t("totals_net_at_rate", lang, rate=rate), cents_to_eur(group["basis"], currency)))
            rows.append(_total(t("totals_vat_at_rate", lang, rate=rate), cents_to_eur(group["tax"], currency)))
    rows.append(_total(t("totals_grand", lang), cents_to_eur(doc.get("total"), currency), "grand"))
    return rows


def _payment_rows(invoice: dict[str, Any], lang: str) -> list[dict[str, str]]:
    paid = signed_paid_cent(invoice)
    if not paid:
        return []
    currency = invoice.get("currency")
    if invoice.get("isCreditNote"):
        paid_row = _total(t("totals_already_refunded", lang), cents_to_eur(paid, currency), "paid")
    else:
        paid_row = _total(t("totals_already_paid", lang), f"− {cents_to_eur(paid, currency)}", "paid")
    remaining = cents_to_eur(open_balance_cent(invoice), currency)
    return [paid_row, _total(t("totals_remaining", lang), remaining, "grand")]


def _credit_note_reference(invoice: dict[str, Any], lang: str) -> list[str]:
    original = invoice.get("correctsInvoice")
    if not (invoice.get("isCreditNote") and original):
        return []
    return [t("credit_note_ref", lang, number=original["number"], date=fmt_date_unix(original.get("issueDate")))]


def _kleinunternehmer_note(doc: dict[str, Any], company: dict[str, Any]) -> list[str]:
    note = company.get("kleinunternehmerNote")
    return [note] if doc.get("isKleinunternehmer") and note else []


def _tax_notices(invoice: dict[str, Any], company: dict[str, Any], lang: str) -> list[str]:
    goods = invoice.get("supplyKind") == "goods"
    notices = _kleinunternehmer_note(invoice, company)
    if invoice.get("reverseChargeType") == "intra_eu":
        notices.append(t("rc_intra_eu_goods" if goods else "rc_intra_eu_services", lang))
    elif invoice.get("reverseChargeType") == "third_country":
        notices.append(t("rc_third_country" if goods else "rc_third_country_services", lang))
    return notices


def _offer_notices(offer: dict[str, Any], company: dict[str, Any], lang: str) -> list[str]:
    goods = offer.get("supplyKind") == "goods"
    notices = _kleinunternehmer_note(offer, company)
    if offer.get("reverseChargeType") == "third_country":
        notices.append(t("offer_export_hint_goods" if goods else "offer_export_hint_services", lang))
    elif offer.get("isReverseCharge"):
        notices.append(t("offer_rc_hint_goods" if goods else "offer_rc_hint_services", lang))
    notices.append(t("offer_disclaimer", lang, date=fmt_date_unix(offer.get("validUntil"))))
    return notices


def _has_skonto(doc: dict[str, Any]) -> bool:
    return bool(doc.get("skontoPercent") and doc.get("skontoDays") and doc.get("skontoAmountCent"))


def _skonto_line(invoice: dict[str, Any], lang: str) -> str | None:
    if not _has_skonto(invoice):
        return None
    return t("skonto_inline", lang,
             date=fmt_date_unix(invoice.get("skontoDeadline")),
             percent=SKONTO_PERCENT_FORMAT % invoice["skontoPercent"],
             amount=cents_to_eur(invoice["skontoAmountCent"], invoice.get("currency")))


def _invoice_payment(invoice: dict[str, Any], company: dict[str, Any], lang: str) -> dict[str, Any] | None:
    if invoice.get("isCreditNote"):
        return None
    epc_payload = invoice_epc_payload(invoice, company)
    terms = invoice.get("paymentTerms")
    if not (terms or invoice.get("skontoPercent") or epc_payload):
        return None
    qr = None
    if epc_payload:
        qr = {"svg": epc_qr_svg(epc_payload),
              "caption": [t("epc_qr_caption_line1", lang), t("epc_qr_caption_line2", lang)]}
    return {
        "title": t("block_payment_terms", lang) if terms else None,
        "text": terms or None,
        "skonto": _skonto_line(invoice, lang),
        "qr": qr,
    }


def _block(title: str | None, text: str) -> dict[str, Any]:
    return {"title": title, "text": text}


def _invoice_blocks(invoice: dict[str, Any], lang: str) -> list[dict[str, Any]]:
    blocks = []
    if invoice.get("isCreditNote"):
        blocks.append(_block(t("block_refund_title", lang), t("block_refund_body", lang)))
    if invoice.get("notes"):
        blocks.append(_block(t("block_notes", lang), invoice["notes"]))
    return blocks


def _offer_blocks(offer: dict[str, Any], lang: str) -> list[dict[str, Any]]:
    blocks = []
    if _has_skonto(offer):
        blocks.append(_block(t("block_skonto_offer", lang),
                             t("skonto_offer_text", lang, days=offer["skontoDays"],
                               percent=SKONTO_PERCENT_FORMAT % offer["skontoPercent"])))
    if offer.get("notes"):
        blocks.append(_block(t("block_notes", lang), offer["notes"]))
    return blocks


# ----- reminder -------------------------------------------------------------


def _reminder_table(reminder: dict[str, Any], invoice: dict[str, Any], currency: str | None) -> dict[str, Any]:
    columns = [
        {"key": "document", "label": "Beleg", "align": "left"},
        {"key": "date", "label": "Datum", "align": "left"},
        {"key": "due", "label": "Ursprünglich fällig", "align": "left"},
        {"key": "amount", "label": "Betrag", "align": "right", "strong": True},
    ]
    row = {
        "document": f"Rechnung {invoice['invoiceNumber']}",
        "date": fmt_date_unix(invoice.get("invoiceIssueDate")),
        "due": fmt_date_unix(invoice.get("invoiceDueDate")),
        "amount": cents_to_eur(reminder["originalTotalCents"], currency),
    }
    return {"title": "Offener Posten", "columns": columns, "rows": [row]}


def _reminder_totals(reminder: dict[str, Any], currency: str | None) -> list[dict[str, str]]:
    rows = [_total("Offener Rechnungsbetrag", cents_to_eur(reminder["originalTotalCents"], currency))]
    if (reminder.get("feeCents") or 0) > 0:
        rows.append(_total("Mahngebühr", cents_to_eur(reminder["feeCents"], currency)))
    if (reminder.get("interestCents") or 0) > 0:
        rows.append(_total("Verzugszinsen", cents_to_eur(reminder["interestCents"], currency)))
    rows.append(_total("Zu zahlender Gesamtbetrag", cents_to_eur(reminder["totalDueCents"], currency), "grand"))
    return rows


def _reminder_blocks(reminder: dict[str, Any], invoice: dict[str, Any], company: dict[str, Any]) -> list[dict[str, Any]]:
    due = fmt_date_unix(reminder["dueDate"])
    blocks = [_block(None, f"Wir bitten um Überweisung auf folgendes Konto bis spätestens {due}:")]
    if company.get("bankName") or company.get("bankIban"):
        lines = [company.get("bankName")]
        if company.get("bankIban"):
            lines.append(f"IBAN: {' '.join(iban_groups(company['bankIban']))}")
        if company.get("bankBic"):
            lines.append(f"BIC: {company['bankBic']}")
        lines.append(f"Verwendungszweck: {invoice['invoiceNumber']}")
        blocks.append(_block(None, "\n".join(line for line in lines if line)))
    blocks.append(_block(None, "Sollte sich diese Mahnung mit Ihrer Zahlung überschneiden, "
                               "betrachten Sie dieses Schreiben bitte als gegenstandslos."))
    return blocks
