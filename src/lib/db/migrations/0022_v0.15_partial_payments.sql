-- v0.15: Teilzahlungen — pro Rechnung eine Liste von Zahlungseingängen.
--
-- Status-Modell erweitert: 'sent' (offen, 0 Zahlungen) → 'partial' (>0 < total)
-- → 'paid' (>= total). SQLite ist enum-typeless, also wird der neue Wert nur
-- app-level akzeptiert; existierende CHECK-Constraints gibt es nicht.
--
-- amount_paid_cent ist cached (Sum aller invoice_payments) — vermeidet Joins
-- in den KPI-Queries. Wird bei jedem CRUD auf invoice_payments rekalkuliert.

CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  paid_at INTEGER NOT NULL,
  amount_cent INTEGER NOT NULL,
  -- EUR-Equivalent für Multi-Currency-Rechnungen, sonst NULL.
  -- Wird beim Insert aus dem invoice.exchange_rate berechnet — Buchungs-
  -- relevante Werte (DATEV-Cash-Basis) müssen ggf. nachträglich anfassbar sein.
  eur_amount_cent INTEGER,
  -- 'manual' | 'camt053' | 'mt940' | 'auto' (markSent voll-bezahlen).
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);

ALTER TABLE invoices ADD COLUMN amount_paid_cent INTEGER NOT NULL DEFAULT 0;

PRAGMA user_version = 23;
