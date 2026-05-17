-- Persist KoSIT validator outcome per document. Recorded after PDF generation
-- (outgoing invoices) and after ZUGFeRD extraction (incoming expenses).
-- last_validation_status: NULL | 'valid' | 'invalid' | 'unavailable'
-- last_validated_at:      unix seconds
-- last_validation_findings_count: integer, 0 when valid
ALTER TABLE invoices ADD COLUMN last_validation_status TEXT;
ALTER TABLE invoices ADD COLUMN last_validated_at INTEGER;
ALTER TABLE invoices ADD COLUMN last_validation_findings_count INTEGER;

ALTER TABLE expenses ADD COLUMN last_validation_status TEXT;
ALTER TABLE expenses ADD COLUMN last_validated_at INTEGER;
ALTER TABLE expenses ADD COLUMN last_validation_findings_count INTEGER;

PRAGMA user_version = 12;
