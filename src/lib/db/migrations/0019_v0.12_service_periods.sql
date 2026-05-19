-- v0.12: Leistungszeitraum auf Rechnungs- + Positionsebene (EN-16931 BG-14 / BG-26)
-- und lange Positionsbeschreibung (BT-154) zusätzlich zum Namen (BT-153).
--
-- Header-Datum-Semantik: `delivery_date` (BT-72) bleibt für Einzeltag.
-- Wenn `service_period_start` UND `service_period_end` gesetzt sind, gilt die
-- Rechnung als Zeitraum-Rechnung (BT-73/74). XOR wird auf App-Ebene erzwungen.
--
-- Line-Periode (BT-134/135) ist immer optional und überschreibt nichts.

ALTER TABLE invoices ADD COLUMN service_period_start INTEGER;
ALTER TABLE invoices ADD COLUMN service_period_end   INTEGER;

ALTER TABLE invoice_items ADD COLUMN long_description TEXT;
ALTER TABLE invoice_items ADD COLUMN line_period_start INTEGER;
ALTER TABLE invoice_items ADD COLUMN line_period_end   INTEGER;

ALTER TABLE offers ADD COLUMN service_period_start INTEGER;
ALTER TABLE offers ADD COLUMN service_period_end   INTEGER;

ALTER TABLE offer_items ADD COLUMN long_description TEXT;
ALTER TABLE offer_items ADD COLUMN line_period_start INTEGER;
ALTER TABLE offer_items ADD COLUMN line_period_end   INTEGER;

-- Recurring: Header speichert keinen Zeitraum (Periode wird beim Generieren
-- automatisch aus dem Intervall + Issue-Date abgeleitet — siehe recurring.ts).
-- Items kriegen aber lange Beschreibung + optionalen Line-Period-Override.
ALTER TABLE recurring_invoice_items ADD COLUMN long_description TEXT;
ALTER TABLE recurring_invoice_items ADD COLUMN line_period_start INTEGER;
ALTER TABLE recurring_invoice_items ADD COLUMN line_period_end   INTEGER;

PRAGMA user_version = 20;
