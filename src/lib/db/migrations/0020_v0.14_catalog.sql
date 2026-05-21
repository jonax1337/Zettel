-- v0.14: Artikel-/Leistungs-Katalog.
-- Wiederverwendbare Positionen für Rechnungen, Angebote, Recurring, Ausgaben.
-- description_en ist nullable und wird erst in v0.16 (englische PDF-Variante)
-- vom UI gepflegt — Spalte aber jetzt schon anlegen, damit der Catalog-Picker
-- den Eintrag dauerhaft hält und keine zweite Migration nötig wird.

CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description_de TEXT NOT NULL DEFAULT '',
  description_en TEXT,
  unit TEXT NOT NULL DEFAULT 'Stk',
  default_unit_price INTEGER NOT NULL DEFAULT 0,
  default_vat_rate INTEGER NOT NULL DEFAULT 19,
  default_datev_account TEXT,
  tags TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_catalog_archived ON catalog_items(archived);
CREATE INDEX IF NOT EXISTS idx_catalog_name ON catalog_items(name);

PRAGMA user_version = 21;
