ALTER TABLE settings ADD COLUMN use_pauschal_tax_reserve INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN pauschal_tax_percent REAL NOT NULL DEFAULT 30.0;

PRAGMA user_version = 16;
