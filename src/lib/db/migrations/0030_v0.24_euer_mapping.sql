-- Anlage EÜR (#144): each expense category maps to a Kennzahl of the form.
-- NULL means "Übrige unbeschränkt abziehbare Betriebsausgaben" (Kz 183).
-- Built-ins are matched by name; user-created categories start unmapped.
ALTER TABLE expense_categories ADD COLUMN euer_kz TEXT;

UPDATE expense_categories SET euer_kz = '228' WHERE builtin = 1 AND name = 'Software / SaaS';
UPDATE expense_categories SET euer_kz = '132' WHERE builtin = 1 AND name = 'Hardware (Sofortabschreibung GWG)';
UPDATE expense_categories SET euer_kz = '280' WHERE builtin = 1 AND name = 'Telefon / Internet';
UPDATE expense_categories SET euer_kz = '221' WHERE builtin = 1 AND name = 'Reisekosten';
UPDATE expense_categories SET euer_kz = '281' WHERE builtin = 1 AND name = 'Fortbildung';
UPDATE expense_categories SET euer_kz = '229' WHERE builtin = 1 AND name = 'Bürobedarf';
UPDATE expense_categories SET euer_kz = '110' WHERE builtin = 1 AND name = 'Honorare / Subunternehmer';
UPDATE expense_categories SET euer_kz = '224' WHERE builtin = 1 AND name = 'Werbung / Marketing';
UPDATE expense_categories SET euer_kz = '183' WHERE builtin = 1 AND name = 'Bankgebühren';
UPDATE expense_categories SET euer_kz = '183' WHERE builtin = 1 AND name = 'Sonstige Betriebsausgaben';

PRAGMA user_version = 31;
