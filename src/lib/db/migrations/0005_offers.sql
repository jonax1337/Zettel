CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  customer_snapshot TEXT NOT NULL DEFAULT '{}',
  issue_date INTEGER NOT NULL,
  valid_until INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','sent','accepted','rejected','expired')),
  subtotal INTEGER NOT NULL DEFAULT 0,
  vat_amount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  is_kleinunternehmer INTEGER NOT NULL DEFAULT 0,
  is_reverse_charge INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  intro_text TEXT,
  pdf_path TEXT,
  converted_invoice_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  sent_at INTEGER,
  accepted_at INTEGER,
  rejected_at INTEGER,
  FOREIGN KEY(converted_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS offer_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Stk',
  unit_price INTEGER NOT NULL DEFAULT 0,
  vat_rate INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(offer_id) REFERENCES offers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_customer ON offers(customer_id);
CREATE INDEX IF NOT EXISTS idx_offers_valid_until ON offers(valid_until);

ALTER TABLE settings ADD COLUMN offer_number_format TEXT NOT NULL DEFAULT 'AN-{YYYY}-{NNNN}';
ALTER TABLE settings ADD COLUMN offer_number_counter INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN default_offer_validity_days INTEGER NOT NULL DEFAULT 30;
