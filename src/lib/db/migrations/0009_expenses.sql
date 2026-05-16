CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact_person TEXT,
  street TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'DE',
  email TEXT,
  phone TEXT,
  vat_id TEXT,
  bank_name TEXT,
  bank_iban TEXT,
  bank_bic TEXT,
  default_category TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);
CREATE INDEX IF NOT EXISTS idx_vendors_number ON vendors(vendor_number);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT,
  internal_number TEXT NOT NULL UNIQUE,
  vendor_id INTEGER NOT NULL,
  vendor_snapshot TEXT NOT NULL DEFAULT '{}',
  issue_date INTEGER NOT NULL,
  due_date INTEGER,
  paid_date INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  subtotal INTEGER NOT NULL DEFAULT 0,
  vat_amount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  is_reverse_charge INTEGER NOT NULL DEFAULT 0,
  reverse_charge_type TEXT NOT NULL DEFAULT 'none',
  zugferd_extracted INTEGER NOT NULL DEFAULT 0,
  pdf_path TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_expenses_vendor ON expenses(vendor_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_issue_date ON expenses(issue_date);

CREATE TABLE IF NOT EXISTS expense_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT,
  datev_account TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Stk',
  unit_price INTEGER NOT NULL DEFAULT 0,
  vat_rate INTEGER NOT NULL DEFAULT 19,
  line_total INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_expense_items_expense ON expense_items(expense_id);

ALTER TABLE settings ADD COLUMN vendor_number_format TEXT NOT NULL DEFAULT 'L-{NNNN}';
ALTER TABLE settings ADD COLUMN vendor_number_counter INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN expense_number_format TEXT NOT NULL DEFAULT 'EX-{YYYY}-{NNNN}';
ALTER TABLE settings ADD COLUMN expense_number_counter INTEGER NOT NULL DEFAULT 0;

PRAGMA user_version = 10;
