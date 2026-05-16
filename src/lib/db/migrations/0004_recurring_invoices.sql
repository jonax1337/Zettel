CREATE TABLE IF NOT EXISTS recurring_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer_id INTEGER NOT NULL,
  interval TEXT NOT NULL CHECK(interval IN ('monthly','quarterly','yearly')),
  start_date INTEGER NOT NULL,
  next_due_date INTEGER NOT NULL,
  last_generated_at INTEGER,
  payment_terms_days INTEGER NOT NULL DEFAULT 14,
  is_reverse_charge INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  payment_terms TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS recurring_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recurring_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Stk',
  unit_price INTEGER NOT NULL DEFAULT 0,
  vat_rate INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(recurring_id) REFERENCES recurring_invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recurring_next_due ON recurring_invoices(active, next_due_date);
