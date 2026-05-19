ALTER TABLE settings ADD COLUMN other_income_annual_cent INTEGER NOT NULL DEFAULT 0;

PRAGMA user_version = 18;
