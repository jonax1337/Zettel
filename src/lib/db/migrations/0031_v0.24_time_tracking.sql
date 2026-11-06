-- Zeiterfassung (#145): projects per customer and time entries per project.
-- A billed entry points at the invoice draft it went into; the invoice tables
-- stay untouched, so the sealed invoice data and its audit triggers are not
-- affected.
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  name TEXT NOT NULL,
  hourly_rate_cent INTEGER NOT NULL DEFAULT 0 CHECK (hourly_rate_cent >= 0),
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_projects_customer_id ON projects(customer_id);

-- started_at/ended_at are both NULL for an entry typed in as a duration.
-- duration_minutes stays NULL only while the timer runs.
CREATE TABLE time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  entry_date INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  description TEXT NOT NULL DEFAULT '',
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX idx_time_entries_entry_date ON time_entries(entry_date);
CREATE INDEX idx_time_entries_invoice_id ON time_entries(invoice_id);

-- At most one running timer: every running row indexes the same constant, so a
-- second one violates uniqueness.
CREATE UNIQUE INDEX uq_time_entries_running ON time_entries((1))
  WHERE started_at IS NOT NULL AND ended_at IS NULL;

PRAGMA user_version = 32;
