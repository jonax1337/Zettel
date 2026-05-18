ALTER TABLE customers ADD COLUMN follow_up_date INTEGER;

ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE invoices ADD COLUMN exchange_rate TEXT;
ALTER TABLE invoices ADD COLUMN eur_total_cent INTEGER;
ALTER TABLE invoices ADD COLUMN notes_internal TEXT;
ALTER TABLE invoices ADD COLUMN follow_up_date INTEGER;

ALTER TABLE offers ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE offers ADD COLUMN exchange_rate TEXT;

PRAGMA user_version = 13;
