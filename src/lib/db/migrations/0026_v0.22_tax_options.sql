-- Lieferung vs. sonstige Leistung bei Reverse-Charge (UStVA KZ 41/21 bzw. 43/45).
-- Bestand wird 'services': bisher druckte jedes EU-PDF den § 13b-Hinweis (Leistung),
-- so bleiben bereits versendete PDFs beim Neu-Erzeugen identisch.
ALTER TABLE invoices ADD COLUMN supply_kind TEXT NOT NULL DEFAULT 'services';
ALTER TABLE offers ADD COLUMN supply_kind TEXT NOT NULL DEFAULT 'services';
ALTER TABLE recurring_invoices ADD COLUMN supply_kind TEXT NOT NULL DEFAULT 'services';
-- Drittland-PDFs druckten bisher den Ausfuhrlieferungs-Hinweis.
UPDATE invoices SET supply_kind = 'goods' WHERE reverse_charge_type = 'third_country';

-- Soll- ('accrual') vs. Ist-Versteuerung ('cash', § 20 UStG) für die UStVA.
ALTER TABLE settings ADD COLUMN vat_accounting TEXT NOT NULL DEFAULT 'accrual';

-- Steuerrücklage: Ausgaben netto (konservativ) oder brutto abziehen.
ALTER TABLE settings ADD COLUMN tax_reserve_expenses_gross INTEGER NOT NULL DEFAULT 0;

PRAGMA user_version = 27;
