"""Translation-Dict für die PDF-Templates.

Ergänzungs-Workflow für neue Strings:
 1. Schlüssel hier in beide Sprachen eintragen.
 2. Im Template `{{ t('schluessel') }}` verwenden.
 3. Tests in test_i18n_pdf.py erweitern.

Wir halten die Schlüssel klein, semantisch und ohne Punkt-Notation —
für ein Solo-Tool reicht ein flaches Mapping. Bei Bedarf später auf
namespaces splitten.

Datums-/Geld-Formatierung bleibt im Filter (`date_unix`, `eur`); die
i18n-Schicht ist nur für reine Labels.
"""
from __future__ import annotations


_DE = {
    "doctype_invoice": "Rechnung",
    "doctype_credit_note": "Stornorechnung",
    "doctype_offer": "Angebot",

    # Meta-Box
    "meta_invoice_no": "Rechnungsnr.",
    "meta_offer_no": "Angebotsnr.",
    "meta_issue_date": "Rechnungsdatum",
    "meta_offer_date": "Angebotsdatum",
    "meta_service_period": "Leistungszeitraum",
    "meta_delivery_date": "Leistungsdatum",
    "meta_due_date": "Fällig am",
    "meta_valid_until": "Gültig bis",
    "meta_customer_vatid": "USt-IdNr. Kunde",

    # Items table
    "col_pos": "Pos.",
    "col_desc": "Beschreibung",
    "col_qty": "Menge",
    "col_unit": "Einheit",
    "col_price": "Einzelpreis",
    "col_vat": "USt %",
    "col_total": "Gesamt",
    "item_period_single": "Leistungsdatum",
    "item_period_range": "Leistungszeitraum",

    # Totals
    "totals_subtotal": "Zwischensumme",
    "totals_vat": "Umsatzsteuer",
    "totals_grand": "Gesamtbetrag",
    "totals_already_paid": "Bereits gezahlt",
    "totals_remaining": "Noch offen",

    # Blocks
    "block_refund_title": "Erstattung",
    "block_refund_body": "Der Betrag wird auf Ihr Konto erstattet.",
    "block_payment_terms": "Zahlungsbedingungen",
    "block_notes": "Hinweise",
    "block_skonto_offer": "Skonto-Angebot",

    "rc_intra_eu": "Steuerschuldnerschaft des Leistungsempfängers / Reverse charge — VAT to be paid by the recipient.",
    "rc_third_country": "Steuerfreie Ausfuhrlieferung / Export outside EU — VAT exempt.",

    "skonto_inline": "Bei Zahlung bis {date}: {percent} % Skonto = {amount}",
    "skonto_offer_text": "Bei Zahlung der späteren Rechnung innerhalb von {days} Tagen ab Rechnungsdatum gewähren wir {percent} % Skonto.",

    "credit_note_ref": "Storno zur Rechnung {number} vom {date}.",
    "offer_disclaimer": "Dieses Angebot ist freibleibend und unverbindlich. Gültig bis {date}. Bei Annahme erstellen wir eine entsprechende Rechnung.",
    "offer_rc_hint": "Bei Auftragsannahme wird die Rechnung mit dem Hinweis \"Steuerschuldnerschaft des Leistungsempfängers\" ausgestellt (Reverse Charge).",

    # Footer
    "footer_contact": "Kontakt",
    "footer_tax": "Steuer",
    "footer_bank": "Bankverbindung",
    "footer_tax_no": "St-Nr.",
    "footer_vat_id": "USt-IdNr.",

    # EPC-QR
    "epc_qr_caption_line1": "QR-Code scannen",
    "epc_qr_caption_line2": "für sofortige Überweisung",

    # Address
    "addr_attention": "z. Hd.",
    "page_n_of_m": "Seite {n} von {m}",
}


_EN = {
    "doctype_invoice": "Invoice",
    "doctype_credit_note": "Credit Note",
    "doctype_offer": "Quotation",

    "meta_invoice_no": "Invoice no.",
    "meta_offer_no": "Quotation no.",
    "meta_issue_date": "Invoice date",
    "meta_offer_date": "Quotation date",
    "meta_service_period": "Service period",
    "meta_delivery_date": "Delivery date",
    "meta_due_date": "Due date",
    "meta_valid_until": "Valid until",
    "meta_customer_vatid": "Buyer VAT ID",

    "col_pos": "No.",
    "col_desc": "Description",
    "col_qty": "Qty",
    "col_unit": "Unit",
    "col_price": "Unit price",
    "col_vat": "VAT %",
    "col_total": "Total",
    "item_period_single": "Service date",
    "item_period_range": "Service period",

    "totals_subtotal": "Subtotal",
    "totals_vat": "VAT",
    "totals_grand": "Total",
    "totals_already_paid": "Already paid",
    "totals_remaining": "Remaining",

    "block_refund_title": "Refund",
    "block_refund_body": "The amount will be refunded to your account.",
    "block_payment_terms": "Payment terms",
    "block_notes": "Notes",
    "block_skonto_offer": "Early-payment discount",

    "rc_intra_eu": "Reverse charge — VAT to be paid by the recipient (intra-EU supply).",
    "rc_third_country": "Export outside EU — VAT exempt.",

    "skonto_inline": "Pay by {date}: {percent}% discount = {amount}",
    "skonto_offer_text": "If the subsequent invoice is paid within {days} days of invoice date, we grant a {percent}% early-payment discount.",

    "credit_note_ref": "Credit note for invoice {number} dated {date}.",
    "offer_disclaimer": "This quotation is non-binding. Valid until {date}. Upon acceptance we will issue a corresponding invoice.",
    "offer_rc_hint": "Upon acceptance, the invoice will be issued with the note \"VAT to be paid by the recipient (reverse charge)\".",

    "footer_contact": "Contact",
    "footer_tax": "Tax",
    "footer_bank": "Bank details",
    "footer_tax_no": "Tax no.",
    "footer_vat_id": "VAT ID",

    "epc_qr_caption_line1": "Scan QR code",
    "epc_qr_caption_line2": "for instant SEPA transfer",

    "addr_attention": "Attn.",
    "page_n_of_m": "Page {n} of {m}",
}


_TABLES = {"de": _DE, "en": _EN}


def t(key: str, language: str = "de", **kwargs) -> str:
    """Look up a translation key. Falls back to DE if the lang/key is unknown.

    Keyword args are passed through to `str.format` for interpolation —
    keeps the template side simple (`{{ t('skonto_inline', date=..., percent=...) }}`).
    """
    table = _TABLES.get(language) or _DE
    raw = table.get(key) or _DE.get(key) or key
    if kwargs:
        try:
            return raw.format(**kwargs)
        except (KeyError, IndexError):
            return raw
    return raw
