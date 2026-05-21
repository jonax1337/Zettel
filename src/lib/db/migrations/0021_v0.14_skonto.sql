-- v0.14: Skonto (Frühzahler-Rabatt) — EN-16931 ApplicableTradePaymentDiscountTerms.
-- Settings tragen einen optionalen Default (z. B. 2 % / 7 Tage); pro Rechnung /
-- Angebot per Override deaktivierbar oder anders setzbar. NULL = kein Skonto.

ALTER TABLE settings ADD COLUMN default_skonto_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN default_skonto_percent REAL NOT NULL DEFAULT 2.0;
ALTER TABLE settings ADD COLUMN default_skonto_days INTEGER NOT NULL DEFAULT 7;

ALTER TABLE invoices ADD COLUMN skonto_percent REAL;
ALTER TABLE invoices ADD COLUMN skonto_days INTEGER;

ALTER TABLE offers ADD COLUMN skonto_percent REAL;
ALTER TABLE offers ADD COLUMN skonto_days INTEGER;

PRAGMA user_version = 22;
