-- Stornorechnungen (is_credit_note = 1) hatten `eur_total_cent` versehentlich
-- mit positivem Vorzeichen gespeichert, während `total` korrekt negativ war.
-- Folge: Dashboard-Aggregate (die `COALESCE(eur_total_cent, total)` und
-- `eur_total_cent * subtotal / total` benutzen) haben den Storno-Brutto
-- positiv eingeschlagen statt netto rausgenettet. Fix: Vorzeichen angleichen.
UPDATE invoices
SET eur_total_cent = -eur_total_cent
WHERE is_credit_note = 1
  AND eur_total_cent IS NOT NULL
  AND eur_total_cent > 0
  AND total < 0;

PRAGMA user_version = 19;
