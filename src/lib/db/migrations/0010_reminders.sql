CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  invoice_id INTEGER NOT NULL,
  invoice_snapshot TEXT NOT NULL DEFAULT '{}',
  level INTEGER NOT NULL DEFAULT 1,
  issue_date INTEGER NOT NULL,
  due_date INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  interest_cents INTEGER NOT NULL DEFAULT 0,
  original_total_cents INTEGER NOT NULL DEFAULT 0,
  total_due_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  body_text TEXT NOT NULL DEFAULT '',
  pdf_path TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  sent_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reminders_invoice ON reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
CREATE INDEX IF NOT EXISTS idx_reminders_issue_date ON reminders(issue_date);

ALTER TABLE settings ADD COLUMN reminder_number_format TEXT NOT NULL DEFAULT 'MA-{YYYY}-{NNNN}';
ALTER TABLE settings ADD COLUMN reminder_number_counter INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN reminder_days_l1 INTEGER NOT NULL DEFAULT 14;
ALTER TABLE settings ADD COLUMN reminder_days_l2 INTEGER NOT NULL DEFAULT 14;
ALTER TABLE settings ADD COLUMN reminder_days_l3 INTEGER NOT NULL DEFAULT 14;
ALTER TABLE settings ADD COLUMN reminder_fee_l1_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN reminder_fee_l2_cents INTEGER NOT NULL DEFAULT 500;
ALTER TABLE settings ADD COLUMN reminder_fee_l3_cents INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE settings ADD COLUMN reminder_text_l1 TEXT NOT NULL DEFAULT 'wir haben festgestellt, dass die unten genannte Rechnung noch nicht ausgeglichen wurde. Möglicherweise ist Ihnen das entgangen — wir bitten höflich um zeitnahe Überweisung des offenen Betrags.';
ALTER TABLE settings ADD COLUMN reminder_text_l2 TEXT NOT NULL DEFAULT 'trotz unserer ersten Zahlungserinnerung ist die unten aufgeführte Rechnung weiterhin unbeglichen. Wir bitten Sie nachdrücklich, den offenen Betrag innerhalb der neuen Frist zu überweisen.';
ALTER TABLE settings ADD COLUMN reminder_text_l3 TEXT NOT NULL DEFAULT 'leider mussten wir feststellen, dass die untenstehende Rechnung trotz zweier Mahnungen weiterhin offen ist. Sollte bis zur unten genannten Frist kein Zahlungseingang erfolgen, behalten wir uns weitere Schritte vor.';

PRAGMA user_version = 11;
