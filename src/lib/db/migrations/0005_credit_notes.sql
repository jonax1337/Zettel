ALTER TABLE invoices ADD COLUMN is_credit_note INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN corrects_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_corrects ON invoices(corrects_invoice_id);
