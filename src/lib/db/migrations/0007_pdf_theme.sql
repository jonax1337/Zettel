ALTER TABLE settings ADD COLUMN pdf_theme TEXT NOT NULL DEFAULT 'classic';

PRAGMA user_version = 8;
