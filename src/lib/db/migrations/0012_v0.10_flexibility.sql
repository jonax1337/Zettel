ALTER TABLE customers ADD COLUMN credit_status TEXT NOT NULL DEFAULT 'good';
ALTER TABLE customers ADD COLUMN credit_note TEXT;
ALTER TABLE customers ADD COLUMN follow_up_date INTEGER;

ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE invoices ADD COLUMN exchange_rate TEXT;
ALTER TABLE invoices ADD COLUMN eur_total_cent INTEGER;
ALTER TABLE invoices ADD COLUMN notes_internal TEXT;
ALTER TABLE invoices ADD COLUMN follow_up_date INTEGER;

ALTER TABLE offers ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE offers ADD COLUMN exchange_rate TEXT;

CREATE TABLE invoice_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_invoice_attachments_invoice ON invoice_attachments(invoice_id);

PRAGMA user_version = 13;
