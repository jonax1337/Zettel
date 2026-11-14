-- XRechnung (#142): the Leitweg-ID (BT-10 buyer reference) lives on the customer
-- and is copied onto each invoice, where it can be overridden. Invoices keep their
-- own copy so that a later change on the customer does not alter issued invoices.
ALTER TABLE customers ADD COLUMN leitweg_id TEXT;
ALTER TABLE customers ADD COLUMN receives_xrechnung INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN buyer_reference TEXT;

-- Mail hand-off (#141): subject and body templates per document type.
-- NULL means the built-in default text.
ALTER TABLE settings ADD COLUMN mail_invoice_subject TEXT;
ALTER TABLE settings ADD COLUMN mail_invoice_body TEXT;
ALTER TABLE settings ADD COLUMN mail_offer_subject TEXT;
ALTER TABLE settings ADD COLUMN mail_offer_body TEXT;
ALTER TABLE settings ADD COLUMN mail_reminder_subject TEXT;
ALTER TABLE settings ADD COLUMN mail_reminder_body TEXT;

PRAGMA user_version = 29;
