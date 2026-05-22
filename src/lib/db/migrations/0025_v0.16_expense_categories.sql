-- v0.16: Kuratierte Ausgaben-Kategorien mit SKR03/SKR04-Konten-Mapping.
--
-- Bestehende Freitext-Spalte expense_items.category bleibt als Legacy-Label
-- erhalten (Backfill-Pfad). Neue category_id-Spalte verweist optional auf
-- die kuratierte Liste — wenn gesetzt, wird beim DATEV-Export das Konto aus
-- der Tabelle gezogen (statt aus expense_items.datev_account).
--
-- builtin = 1 markiert vom App-Default eingespielte Einträge. User dürfen
-- builtin-Einträge bearbeiten, aber wir können sie bei einem späteren Reset
-- wiedererkennen. archived versteckt sie im Picker, ohne sie zu löschen.

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  datev_account_skr03 TEXT,
  datev_account_skr04 TEXT,
  builtin INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_archived ON expense_categories(archived);

-- Standard-Kategorien für Solo-Freelancer.
-- Konten gemäß DATEV SKR03/SKR04 (siehe docs/datev-export.md).
INSERT INTO expense_categories (name, datev_account_skr03, datev_account_skr04, builtin, sort_order) VALUES
  ('Software / SaaS',                    '4806', '6815', 1, 10),
  ('Hardware (Sofortabschreibung GWG)',  '0480', '0670', 1, 20),
  ('Telefon / Internet',                 '4920', '6805', 1, 30),
  ('Reisekosten',                        '4660', '6660', 1, 40),
  ('Fortbildung',                        '4946', '6821', 1, 50),
  ('Bürobedarf',                         '4930', '6815', 1, 60),
  ('Honorare / Subunternehmer',          '4783', '6300', 1, 70),
  ('Werbung / Marketing',                '4610', '6600', 1, 80),
  ('Bankgebühren',                       '4970', '6855', 1, 90),
  ('Sonstige Betriebsausgaben',          '4980', '6850', 1, 100);

ALTER TABLE expense_items ADD COLUMN category_id INTEGER;

PRAGMA user_version = 26;
