ALTER TABLE settings ADD COLUMN legal_form TEXT NOT NULL DEFAULT 'freelancer';
ALTER TABLE settings ADD COLUMN trade_tax_rate REAL NOT NULL DEFAULT 4.0;
ALTER TABLE settings ADD COLUMN church_tax_rate REAL NOT NULL DEFAULT 0.0;
ALTER TABLE settings ADD COLUMN tax_filing_status TEXT NOT NULL DEFAULT 'single';
ALTER TABLE settings ADD COLUMN est_prepayment_q1_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN est_prepayment_q2_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN est_prepayment_q3_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN est_prepayment_q4_cent INTEGER NOT NULL DEFAULT 0;

PRAGMA user_version = 15;
