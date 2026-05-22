-- v0.16: PDF-Sprache pro Rechnung / Angebot.
--
-- Default 'de' für alle bestehenden Datensätze — Verhalten ist identisch zu
-- v0.15. Beim Anlegen neuer Rechnungen wird der Settings-Default vorbelegt.
-- ZUGFeRD-XML ist data-only und bleibt sprach-neutral; nur das visuelle PDF
-- wird übersetzt (Labels, Hinweistexte, Tabellenköpfe).

ALTER TABLE invoices ADD COLUMN pdf_language TEXT NOT NULL DEFAULT 'de';
ALTER TABLE offers   ADD COLUMN pdf_language TEXT NOT NULL DEFAULT 'de';
ALTER TABLE settings ADD COLUMN default_pdf_language TEXT NOT NULL DEFAULT 'de';

PRAGMA user_version = 25;
