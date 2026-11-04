-- invoices.status still carries the CHECK from 0001 without 'partial' (0022
-- assumed there was none), so every partial payment failed after its payment
-- row had been inserted.
--
-- Relaxing a CHECK is the case sqlite.org/lang_altertable.html#otheralter
-- documents for editing the stored schema text. A table rebuild is not safe here:
-- tauri-plugin-sql runs each migration inside a transaction with
-- foreign_keys=ON, where PRAGMA foreign_keys=OFF is a no-op and DROP TABLE
-- invoices would cascade-delete invoice items.
PRAGMA writable_schema = ON;
UPDATE sqlite_master
   SET sql = replace(
     sql,
     'CHECK (status IN (''draft'',''sent'',''paid'',''cancelled''))',
     'CHECK (status IN (''draft'',''sent'',''partial'',''paid'',''cancelled''))'
   )
 WHERE type = 'table' AND name = 'invoices';
-- RESET reloads the schema of this connection; the ALTER TABLEs below bump the
-- schema cookie, which makes every other pooled connection reload it as well.
PRAGMA writable_schema = RESET;

-- Aborts the migration unless the old CHECK text was found and replaced. If the
-- stored text differed (whitespace, a hand-repaired DB), replace() would silently
-- do nothing and 'partial' would stay forbidden.
CREATE TEMP TABLE migration_0027_guard (check_relaxed INTEGER CHECK (check_relaxed = 1));
INSERT INTO migration_0027_guard
  SELECT instr(sql, 'CHECK (status IN (''draft'',''sent'',''paid'',''cancelled''))') = 0
         AND instr(sql, 'CHECK (status IN (''draft'',''sent'',''partial'',''paid'',''cancelled''))') > 0
    FROM sqlite_master WHERE type = 'table' AND name = 'invoices';
DROP TABLE migration_0027_guard;

-- Partial payments recorded while the CHECK rejected 'partial' never reached
-- their invoice. Only the unambiguous case is repaired: a sent invoice whose
-- payments cover part of its total.
UPDATE invoices
   SET status = 'partial',
       amount_paid_cent = (SELECT SUM(p.amount_cent) FROM invoice_payments p WHERE p.invoice_id = invoices.id)
 WHERE status = 'sent'
   AND (SELECT COALESCE(SUM(p.amount_cent), 0) FROM invoice_payments p WHERE p.invoice_id = invoices.id)
       BETWEEN 1 AND abs(total) - 1;

-- Offers and recurring templates only knew "reverse charge yes/no"; invoices
-- distinguish intra-EU (K) from third-country (G). The boolean stays for older
-- readers; the backfill keeps what conversions produced so far.
ALTER TABLE offers ADD COLUMN reverse_charge_type TEXT NOT NULL DEFAULT 'none';
UPDATE offers SET reverse_charge_type = 'intra_eu' WHERE is_reverse_charge = 1;
ALTER TABLE recurring_invoices ADD COLUMN reverse_charge_type TEXT NOT NULL DEFAULT 'none';
UPDATE recurring_invoices SET reverse_charge_type = 'intra_eu' WHERE is_reverse_charge = 1;

-- Dedupe key of an imported bank booking, so re-importing a statement does not
-- book its payments twice. NULL for manual payments.
ALTER TABLE invoice_payments ADD COLUMN bank_transaction_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payments_bank_transaction
  ON invoice_payments(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;

PRAGMA user_version = 28;
