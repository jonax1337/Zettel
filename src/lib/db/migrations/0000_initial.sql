CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'DE',
  tax_number TEXT NOT NULL DEFAULT '',
  vat_id TEXT,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  website TEXT,
  bank_name TEXT NOT NULL DEFAULT '',
  bank_iban TEXT NOT NULL DEFAULT '',
  bank_bic TEXT NOT NULL DEFAULT '',
  is_kleinunternehmer INTEGER NOT NULL DEFAULT 1,
  kleinunternehmer_note TEXT NOT NULL DEFAULT 'Gemäß § 19 UStG enthält die Rechnung keinen Umsatzsteuerausweis.',
  invoice_number_format TEXT NOT NULL DEFAULT 'RE-{YYYY}-{NNNN}',
  invoice_number_counter INTEGER NOT NULL DEFAULT 0,
  default_payment_terms_days INTEGER NOT NULL DEFAULT 14,
  logo_path TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact_person TEXT,
  street TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'DE',
  email TEXT,
  phone TEXT,
  vat_id TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_number ON customers(customer_number);
