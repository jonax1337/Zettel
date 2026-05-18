DROP INDEX IF EXISTS idx_invoice_attachments_invoice;
DROP TABLE IF EXISTS invoice_attachments;

ALTER TABLE customers DROP COLUMN credit_status;
ALTER TABLE customers DROP COLUMN credit_note;

PRAGMA user_version = 14;
