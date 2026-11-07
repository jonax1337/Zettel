-- PDF engine for invoices, offers and reminders: 'weasyprint' or 'typst'.
ALTER TABLE settings ADD COLUMN pdf_renderer TEXT NOT NULL DEFAULT 'weasyprint';

-- The audit triggers name every column, so they are recreated with the new one
-- (output of `python tools/gen_audit_triggers.py settings`).
DROP TRIGGER audit_settings_insert;
DROP TRIGGER audit_settings_update;
DROP TRIGGER audit_settings_delete;

CREATE TRIGGER audit_settings_insert AFTER INSERT ON settings
BEGIN
  INSERT INTO audit_log (table_name, row_id, parent_id, action, new_values)
  SELECT 'settings', NEW.id, NULL, 'insert', json_group_object(k, v)
  FROM (
      SELECT 'id' AS k, NEW.id AS v
      UNION ALL SELECT 'company_name', NEW.company_name
      UNION ALL SELECT 'owner_name', NEW.owner_name
      UNION ALL SELECT 'street', NEW.street
      UNION ALL SELECT 'postal_code', NEW.postal_code
      UNION ALL SELECT 'city', NEW.city
      UNION ALL SELECT 'country', NEW.country
      UNION ALL SELECT 'tax_number', NEW.tax_number
      UNION ALL SELECT 'vat_id', NEW.vat_id
      UNION ALL SELECT 'email', NEW.email
      UNION ALL SELECT 'phone', NEW.phone
      UNION ALL SELECT 'website', NEW.website
      UNION ALL SELECT 'bank_name', NEW.bank_name
      UNION ALL SELECT 'bank_iban', NEW.bank_iban
      UNION ALL SELECT 'bank_bic', NEW.bank_bic
      UNION ALL SELECT 'is_kleinunternehmer', NEW.is_kleinunternehmer
      UNION ALL SELECT 'kleinunternehmer_note', NEW.kleinunternehmer_note
      UNION ALL SELECT 'invoice_number_format', NEW.invoice_number_format
      UNION ALL SELECT 'invoice_number_counter', NEW.invoice_number_counter
      UNION ALL SELECT 'default_payment_terms_days', NEW.default_payment_terms_days
      UNION ALL SELECT 'logo_path', NEW.logo_path
      UNION ALL SELECT 'created_at', NEW.created_at
      UNION ALL SELECT 'zugferd_profile', NEW.zugferd_profile
      UNION ALL SELECT 'offer_number_format', NEW.offer_number_format
      UNION ALL SELECT 'offer_number_counter', NEW.offer_number_counter
      UNION ALL SELECT 'default_offer_validity_days', NEW.default_offer_validity_days
      UNION ALL SELECT 'pdf_theme', NEW.pdf_theme
      UNION ALL SELECT 'vendor_number_format', NEW.vendor_number_format
      UNION ALL SELECT 'vendor_number_counter', NEW.vendor_number_counter
      UNION ALL SELECT 'expense_number_format', NEW.expense_number_format
      UNION ALL SELECT 'expense_number_counter', NEW.expense_number_counter
      UNION ALL SELECT 'reminder_number_format', NEW.reminder_number_format
      UNION ALL SELECT 'reminder_number_counter', NEW.reminder_number_counter
      UNION ALL SELECT 'reminder_days_l1', NEW.reminder_days_l1
      UNION ALL SELECT 'reminder_days_l2', NEW.reminder_days_l2
      UNION ALL SELECT 'reminder_days_l3', NEW.reminder_days_l3
      UNION ALL SELECT 'reminder_fee_l1_cents', NEW.reminder_fee_l1_cents
      UNION ALL SELECT 'reminder_fee_l2_cents', NEW.reminder_fee_l2_cents
      UNION ALL SELECT 'reminder_fee_l3_cents', NEW.reminder_fee_l3_cents
      UNION ALL SELECT 'reminder_text_l1', NEW.reminder_text_l1
      UNION ALL SELECT 'reminder_text_l2', NEW.reminder_text_l2
      UNION ALL SELECT 'reminder_text_l3', NEW.reminder_text_l3
      UNION ALL SELECT 'legal_form', NEW.legal_form
      UNION ALL SELECT 'trade_tax_rate', NEW.trade_tax_rate
      UNION ALL SELECT 'church_tax_rate', NEW.church_tax_rate
      UNION ALL SELECT 'tax_filing_status', NEW.tax_filing_status
      UNION ALL SELECT 'est_prepayment_q1_cent', NEW.est_prepayment_q1_cent
      UNION ALL SELECT 'est_prepayment_q2_cent', NEW.est_prepayment_q2_cent
      UNION ALL SELECT 'est_prepayment_q3_cent', NEW.est_prepayment_q3_cent
      UNION ALL SELECT 'est_prepayment_q4_cent', NEW.est_prepayment_q4_cent
      UNION ALL SELECT 'use_pauschal_tax_reserve', NEW.use_pauschal_tax_reserve
      UNION ALL SELECT 'pauschal_tax_percent', NEW.pauschal_tax_percent
      UNION ALL SELECT 'other_income_annual_cent', NEW.other_income_annual_cent
      UNION ALL SELECT 'default_skonto_active', NEW.default_skonto_active
      UNION ALL SELECT 'default_skonto_percent', NEW.default_skonto_percent
      UNION ALL SELECT 'default_skonto_days', NEW.default_skonto_days
      UNION ALL SELECT 'auto_backup_interval_days', NEW.auto_backup_interval_days
      UNION ALL SELECT 'default_pdf_language', NEW.default_pdf_language
      UNION ALL SELECT 'vat_accounting', NEW.vat_accounting
      UNION ALL SELECT 'tax_reserve_expenses_gross', NEW.tax_reserve_expenses_gross
      UNION ALL SELECT 'mail_invoice_subject', NEW.mail_invoice_subject
      UNION ALL SELECT 'mail_invoice_body', NEW.mail_invoice_body
      UNION ALL SELECT 'mail_offer_subject', NEW.mail_offer_subject
      UNION ALL SELECT 'mail_offer_body', NEW.mail_offer_body
      UNION ALL SELECT 'mail_reminder_subject', NEW.mail_reminder_subject
      UNION ALL SELECT 'mail_reminder_body', NEW.mail_reminder_body
      UNION ALL SELECT 'pdf_renderer', NEW.pdf_renderer
  );
END;

CREATE TRIGGER audit_settings_update AFTER UPDATE ON settings
WHEN OLD.id IS NOT NEW.id
   OR OLD.company_name IS NOT NEW.company_name
   OR OLD.owner_name IS NOT NEW.owner_name
   OR OLD.street IS NOT NEW.street
   OR OLD.postal_code IS NOT NEW.postal_code
   OR OLD.city IS NOT NEW.city
   OR OLD.country IS NOT NEW.country
   OR OLD.tax_number IS NOT NEW.tax_number
   OR OLD.vat_id IS NOT NEW.vat_id
   OR OLD.email IS NOT NEW.email
   OR OLD.phone IS NOT NEW.phone
   OR OLD.website IS NOT NEW.website
   OR OLD.bank_name IS NOT NEW.bank_name
   OR OLD.bank_iban IS NOT NEW.bank_iban
   OR OLD.bank_bic IS NOT NEW.bank_bic
   OR OLD.is_kleinunternehmer IS NOT NEW.is_kleinunternehmer
   OR OLD.kleinunternehmer_note IS NOT NEW.kleinunternehmer_note
   OR OLD.invoice_number_format IS NOT NEW.invoice_number_format
   OR OLD.invoice_number_counter IS NOT NEW.invoice_number_counter
   OR OLD.default_payment_terms_days IS NOT NEW.default_payment_terms_days
   OR OLD.logo_path IS NOT NEW.logo_path
   OR OLD.created_at IS NOT NEW.created_at
   OR OLD.zugferd_profile IS NOT NEW.zugferd_profile
   OR OLD.offer_number_format IS NOT NEW.offer_number_format
   OR OLD.offer_number_counter IS NOT NEW.offer_number_counter
   OR OLD.default_offer_validity_days IS NOT NEW.default_offer_validity_days
   OR OLD.pdf_theme IS NOT NEW.pdf_theme
   OR OLD.vendor_number_format IS NOT NEW.vendor_number_format
   OR OLD.vendor_number_counter IS NOT NEW.vendor_number_counter
   OR OLD.expense_number_format IS NOT NEW.expense_number_format
   OR OLD.expense_number_counter IS NOT NEW.expense_number_counter
   OR OLD.reminder_number_format IS NOT NEW.reminder_number_format
   OR OLD.reminder_number_counter IS NOT NEW.reminder_number_counter
   OR OLD.reminder_days_l1 IS NOT NEW.reminder_days_l1
   OR OLD.reminder_days_l2 IS NOT NEW.reminder_days_l2
   OR OLD.reminder_days_l3 IS NOT NEW.reminder_days_l3
   OR OLD.reminder_fee_l1_cents IS NOT NEW.reminder_fee_l1_cents
   OR OLD.reminder_fee_l2_cents IS NOT NEW.reminder_fee_l2_cents
   OR OLD.reminder_fee_l3_cents IS NOT NEW.reminder_fee_l3_cents
   OR OLD.reminder_text_l1 IS NOT NEW.reminder_text_l1
   OR OLD.reminder_text_l2 IS NOT NEW.reminder_text_l2
   OR OLD.reminder_text_l3 IS NOT NEW.reminder_text_l3
   OR OLD.legal_form IS NOT NEW.legal_form
   OR OLD.trade_tax_rate IS NOT NEW.trade_tax_rate
   OR OLD.church_tax_rate IS NOT NEW.church_tax_rate
   OR OLD.tax_filing_status IS NOT NEW.tax_filing_status
   OR OLD.est_prepayment_q1_cent IS NOT NEW.est_prepayment_q1_cent
   OR OLD.est_prepayment_q2_cent IS NOT NEW.est_prepayment_q2_cent
   OR OLD.est_prepayment_q3_cent IS NOT NEW.est_prepayment_q3_cent
   OR OLD.est_prepayment_q4_cent IS NOT NEW.est_prepayment_q4_cent
   OR OLD.use_pauschal_tax_reserve IS NOT NEW.use_pauschal_tax_reserve
   OR OLD.pauschal_tax_percent IS NOT NEW.pauschal_tax_percent
   OR OLD.other_income_annual_cent IS NOT NEW.other_income_annual_cent
   OR OLD.default_skonto_active IS NOT NEW.default_skonto_active
   OR OLD.default_skonto_percent IS NOT NEW.default_skonto_percent
   OR OLD.default_skonto_days IS NOT NEW.default_skonto_days
   OR OLD.auto_backup_interval_days IS NOT NEW.auto_backup_interval_days
   OR OLD.default_pdf_language IS NOT NEW.default_pdf_language
   OR OLD.vat_accounting IS NOT NEW.vat_accounting
   OR OLD.tax_reserve_expenses_gross IS NOT NEW.tax_reserve_expenses_gross
   OR OLD.mail_invoice_subject IS NOT NEW.mail_invoice_subject
   OR OLD.mail_invoice_body IS NOT NEW.mail_invoice_body
   OR OLD.mail_offer_subject IS NOT NEW.mail_offer_subject
   OR OLD.mail_offer_body IS NOT NEW.mail_offer_body
   OR OLD.mail_reminder_subject IS NOT NEW.mail_reminder_subject
   OR OLD.mail_reminder_body IS NOT NEW.mail_reminder_body
   OR OLD.pdf_renderer IS NOT NEW.pdf_renderer
BEGIN
  INSERT INTO audit_log (table_name, row_id, parent_id, action, old_values, new_values)
  SELECT 'settings', NEW.id, NULL, 'update', json_group_object(k, o), json_group_object(k, n)
  FROM (
      SELECT 'id' AS k, OLD.id AS o, NEW.id AS n
      UNION ALL SELECT 'company_name', OLD.company_name, NEW.company_name
      UNION ALL SELECT 'owner_name', OLD.owner_name, NEW.owner_name
      UNION ALL SELECT 'street', OLD.street, NEW.street
      UNION ALL SELECT 'postal_code', OLD.postal_code, NEW.postal_code
      UNION ALL SELECT 'city', OLD.city, NEW.city
      UNION ALL SELECT 'country', OLD.country, NEW.country
      UNION ALL SELECT 'tax_number', OLD.tax_number, NEW.tax_number
      UNION ALL SELECT 'vat_id', OLD.vat_id, NEW.vat_id
      UNION ALL SELECT 'email', OLD.email, NEW.email
      UNION ALL SELECT 'phone', OLD.phone, NEW.phone
      UNION ALL SELECT 'website', OLD.website, NEW.website
      UNION ALL SELECT 'bank_name', OLD.bank_name, NEW.bank_name
      UNION ALL SELECT 'bank_iban', OLD.bank_iban, NEW.bank_iban
      UNION ALL SELECT 'bank_bic', OLD.bank_bic, NEW.bank_bic
      UNION ALL SELECT 'is_kleinunternehmer', OLD.is_kleinunternehmer, NEW.is_kleinunternehmer
      UNION ALL SELECT 'kleinunternehmer_note', OLD.kleinunternehmer_note, NEW.kleinunternehmer_note
      UNION ALL SELECT 'invoice_number_format', OLD.invoice_number_format, NEW.invoice_number_format
      UNION ALL SELECT 'invoice_number_counter', OLD.invoice_number_counter, NEW.invoice_number_counter
      UNION ALL SELECT 'default_payment_terms_days', OLD.default_payment_terms_days, NEW.default_payment_terms_days
      UNION ALL SELECT 'logo_path', OLD.logo_path, NEW.logo_path
      UNION ALL SELECT 'created_at', OLD.created_at, NEW.created_at
      UNION ALL SELECT 'zugferd_profile', OLD.zugferd_profile, NEW.zugferd_profile
      UNION ALL SELECT 'offer_number_format', OLD.offer_number_format, NEW.offer_number_format
      UNION ALL SELECT 'offer_number_counter', OLD.offer_number_counter, NEW.offer_number_counter
      UNION ALL SELECT 'default_offer_validity_days', OLD.default_offer_validity_days, NEW.default_offer_validity_days
      UNION ALL SELECT 'pdf_theme', OLD.pdf_theme, NEW.pdf_theme
      UNION ALL SELECT 'vendor_number_format', OLD.vendor_number_format, NEW.vendor_number_format
      UNION ALL SELECT 'vendor_number_counter', OLD.vendor_number_counter, NEW.vendor_number_counter
      UNION ALL SELECT 'expense_number_format', OLD.expense_number_format, NEW.expense_number_format
      UNION ALL SELECT 'expense_number_counter', OLD.expense_number_counter, NEW.expense_number_counter
      UNION ALL SELECT 'reminder_number_format', OLD.reminder_number_format, NEW.reminder_number_format
      UNION ALL SELECT 'reminder_number_counter', OLD.reminder_number_counter, NEW.reminder_number_counter
      UNION ALL SELECT 'reminder_days_l1', OLD.reminder_days_l1, NEW.reminder_days_l1
      UNION ALL SELECT 'reminder_days_l2', OLD.reminder_days_l2, NEW.reminder_days_l2
      UNION ALL SELECT 'reminder_days_l3', OLD.reminder_days_l3, NEW.reminder_days_l3
      UNION ALL SELECT 'reminder_fee_l1_cents', OLD.reminder_fee_l1_cents, NEW.reminder_fee_l1_cents
      UNION ALL SELECT 'reminder_fee_l2_cents', OLD.reminder_fee_l2_cents, NEW.reminder_fee_l2_cents
      UNION ALL SELECT 'reminder_fee_l3_cents', OLD.reminder_fee_l3_cents, NEW.reminder_fee_l3_cents
      UNION ALL SELECT 'reminder_text_l1', OLD.reminder_text_l1, NEW.reminder_text_l1
      UNION ALL SELECT 'reminder_text_l2', OLD.reminder_text_l2, NEW.reminder_text_l2
      UNION ALL SELECT 'reminder_text_l3', OLD.reminder_text_l3, NEW.reminder_text_l3
      UNION ALL SELECT 'legal_form', OLD.legal_form, NEW.legal_form
      UNION ALL SELECT 'trade_tax_rate', OLD.trade_tax_rate, NEW.trade_tax_rate
      UNION ALL SELECT 'church_tax_rate', OLD.church_tax_rate, NEW.church_tax_rate
      UNION ALL SELECT 'tax_filing_status', OLD.tax_filing_status, NEW.tax_filing_status
      UNION ALL SELECT 'est_prepayment_q1_cent', OLD.est_prepayment_q1_cent, NEW.est_prepayment_q1_cent
      UNION ALL SELECT 'est_prepayment_q2_cent', OLD.est_prepayment_q2_cent, NEW.est_prepayment_q2_cent
      UNION ALL SELECT 'est_prepayment_q3_cent', OLD.est_prepayment_q3_cent, NEW.est_prepayment_q3_cent
      UNION ALL SELECT 'est_prepayment_q4_cent', OLD.est_prepayment_q4_cent, NEW.est_prepayment_q4_cent
      UNION ALL SELECT 'use_pauschal_tax_reserve', OLD.use_pauschal_tax_reserve, NEW.use_pauschal_tax_reserve
      UNION ALL SELECT 'pauschal_tax_percent', OLD.pauschal_tax_percent, NEW.pauschal_tax_percent
      UNION ALL SELECT 'other_income_annual_cent', OLD.other_income_annual_cent, NEW.other_income_annual_cent
      UNION ALL SELECT 'default_skonto_active', OLD.default_skonto_active, NEW.default_skonto_active
      UNION ALL SELECT 'default_skonto_percent', OLD.default_skonto_percent, NEW.default_skonto_percent
      UNION ALL SELECT 'default_skonto_days', OLD.default_skonto_days, NEW.default_skonto_days
      UNION ALL SELECT 'auto_backup_interval_days', OLD.auto_backup_interval_days, NEW.auto_backup_interval_days
      UNION ALL SELECT 'default_pdf_language', OLD.default_pdf_language, NEW.default_pdf_language
      UNION ALL SELECT 'vat_accounting', OLD.vat_accounting, NEW.vat_accounting
      UNION ALL SELECT 'tax_reserve_expenses_gross', OLD.tax_reserve_expenses_gross, NEW.tax_reserve_expenses_gross
      UNION ALL SELECT 'mail_invoice_subject', OLD.mail_invoice_subject, NEW.mail_invoice_subject
      UNION ALL SELECT 'mail_invoice_body', OLD.mail_invoice_body, NEW.mail_invoice_body
      UNION ALL SELECT 'mail_offer_subject', OLD.mail_offer_subject, NEW.mail_offer_subject
      UNION ALL SELECT 'mail_offer_body', OLD.mail_offer_body, NEW.mail_offer_body
      UNION ALL SELECT 'mail_reminder_subject', OLD.mail_reminder_subject, NEW.mail_reminder_subject
      UNION ALL SELECT 'mail_reminder_body', OLD.mail_reminder_body, NEW.mail_reminder_body
      UNION ALL SELECT 'pdf_renderer', OLD.pdf_renderer, NEW.pdf_renderer
  )
  WHERE o IS NOT n;
END;

CREATE TRIGGER audit_settings_delete AFTER DELETE ON settings
BEGIN
  INSERT INTO audit_log (table_name, row_id, parent_id, action, old_values)
  SELECT 'settings', OLD.id, NULL, 'delete', json_group_object(k, v)
  FROM (
      SELECT 'id' AS k, OLD.id AS v
      UNION ALL SELECT 'company_name', OLD.company_name
      UNION ALL SELECT 'owner_name', OLD.owner_name
      UNION ALL SELECT 'street', OLD.street
      UNION ALL SELECT 'postal_code', OLD.postal_code
      UNION ALL SELECT 'city', OLD.city
      UNION ALL SELECT 'country', OLD.country
      UNION ALL SELECT 'tax_number', OLD.tax_number
      UNION ALL SELECT 'vat_id', OLD.vat_id
      UNION ALL SELECT 'email', OLD.email
      UNION ALL SELECT 'phone', OLD.phone
      UNION ALL SELECT 'website', OLD.website
      UNION ALL SELECT 'bank_name', OLD.bank_name
      UNION ALL SELECT 'bank_iban', OLD.bank_iban
      UNION ALL SELECT 'bank_bic', OLD.bank_bic
      UNION ALL SELECT 'is_kleinunternehmer', OLD.is_kleinunternehmer
      UNION ALL SELECT 'kleinunternehmer_note', OLD.kleinunternehmer_note
      UNION ALL SELECT 'invoice_number_format', OLD.invoice_number_format
      UNION ALL SELECT 'invoice_number_counter', OLD.invoice_number_counter
      UNION ALL SELECT 'default_payment_terms_days', OLD.default_payment_terms_days
      UNION ALL SELECT 'logo_path', OLD.logo_path
      UNION ALL SELECT 'created_at', OLD.created_at
      UNION ALL SELECT 'zugferd_profile', OLD.zugferd_profile
      UNION ALL SELECT 'offer_number_format', OLD.offer_number_format
      UNION ALL SELECT 'offer_number_counter', OLD.offer_number_counter
      UNION ALL SELECT 'default_offer_validity_days', OLD.default_offer_validity_days
      UNION ALL SELECT 'pdf_theme', OLD.pdf_theme
      UNION ALL SELECT 'vendor_number_format', OLD.vendor_number_format
      UNION ALL SELECT 'vendor_number_counter', OLD.vendor_number_counter
      UNION ALL SELECT 'expense_number_format', OLD.expense_number_format
      UNION ALL SELECT 'expense_number_counter', OLD.expense_number_counter
      UNION ALL SELECT 'reminder_number_format', OLD.reminder_number_format
      UNION ALL SELECT 'reminder_number_counter', OLD.reminder_number_counter
      UNION ALL SELECT 'reminder_days_l1', OLD.reminder_days_l1
      UNION ALL SELECT 'reminder_days_l2', OLD.reminder_days_l2
      UNION ALL SELECT 'reminder_days_l3', OLD.reminder_days_l3
      UNION ALL SELECT 'reminder_fee_l1_cents', OLD.reminder_fee_l1_cents
      UNION ALL SELECT 'reminder_fee_l2_cents', OLD.reminder_fee_l2_cents
      UNION ALL SELECT 'reminder_fee_l3_cents', OLD.reminder_fee_l3_cents
      UNION ALL SELECT 'reminder_text_l1', OLD.reminder_text_l1
      UNION ALL SELECT 'reminder_text_l2', OLD.reminder_text_l2
      UNION ALL SELECT 'reminder_text_l3', OLD.reminder_text_l3
      UNION ALL SELECT 'legal_form', OLD.legal_form
      UNION ALL SELECT 'trade_tax_rate', OLD.trade_tax_rate
      UNION ALL SELECT 'church_tax_rate', OLD.church_tax_rate
      UNION ALL SELECT 'tax_filing_status', OLD.tax_filing_status
      UNION ALL SELECT 'est_prepayment_q1_cent', OLD.est_prepayment_q1_cent
      UNION ALL SELECT 'est_prepayment_q2_cent', OLD.est_prepayment_q2_cent
      UNION ALL SELECT 'est_prepayment_q3_cent', OLD.est_prepayment_q3_cent
      UNION ALL SELECT 'est_prepayment_q4_cent', OLD.est_prepayment_q4_cent
      UNION ALL SELECT 'use_pauschal_tax_reserve', OLD.use_pauschal_tax_reserve
      UNION ALL SELECT 'pauschal_tax_percent', OLD.pauschal_tax_percent
      UNION ALL SELECT 'other_income_annual_cent', OLD.other_income_annual_cent
      UNION ALL SELECT 'default_skonto_active', OLD.default_skonto_active
      UNION ALL SELECT 'default_skonto_percent', OLD.default_skonto_percent
      UNION ALL SELECT 'default_skonto_days', OLD.default_skonto_days
      UNION ALL SELECT 'auto_backup_interval_days', OLD.auto_backup_interval_days
      UNION ALL SELECT 'default_pdf_language', OLD.default_pdf_language
      UNION ALL SELECT 'vat_accounting', OLD.vat_accounting
      UNION ALL SELECT 'tax_reserve_expenses_gross', OLD.tax_reserve_expenses_gross
      UNION ALL SELECT 'mail_invoice_subject', OLD.mail_invoice_subject
      UNION ALL SELECT 'mail_invoice_body', OLD.mail_invoice_body
      UNION ALL SELECT 'mail_offer_subject', OLD.mail_offer_subject
      UNION ALL SELECT 'mail_offer_body', OLD.mail_offer_body
      UNION ALL SELECT 'mail_reminder_subject', OLD.mail_reminder_subject
      UNION ALL SELECT 'mail_reminder_body', OLD.mail_reminder_body
      UNION ALL SELECT 'pdf_renderer', OLD.pdf_renderer
  );
END;

PRAGMA user_version = 33;
