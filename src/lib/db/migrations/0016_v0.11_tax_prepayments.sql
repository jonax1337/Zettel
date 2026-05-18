CREATE TABLE tax_prepayments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  amount_cent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(year, quarter)
);
CREATE INDEX idx_tax_prepayments_year ON tax_prepayments(year);

INSERT INTO tax_prepayments (year, quarter, amount_cent)
SELECT CAST(strftime('%Y', 'now') AS INTEGER), 1, est_prepayment_q1_cent FROM settings WHERE id = 1
UNION ALL SELECT CAST(strftime('%Y', 'now') AS INTEGER), 2, est_prepayment_q2_cent FROM settings WHERE id = 1
UNION ALL SELECT CAST(strftime('%Y', 'now') AS INTEGER), 3, est_prepayment_q3_cent FROM settings WHERE id = 1
UNION ALL SELECT CAST(strftime('%Y', 'now') AS INTEGER), 4, est_prepayment_q4_cent FROM settings WHERE id = 1;

PRAGMA user_version = 17;
