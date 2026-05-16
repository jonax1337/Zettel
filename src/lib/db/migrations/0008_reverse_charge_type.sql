ALTER TABLE invoices ADD COLUMN reverse_charge_type TEXT NOT NULL DEFAULT 'none';
UPDATE invoices SET reverse_charge_type = 'intra_eu' WHERE is_reverse_charge = 1;
PRAGMA user_version = 9;
