import { execute, select } from "./client";

export type Quarter = 1 | 2 | 3 | 4;

export interface PrepaymentRow {
  year: number;
  quarter: Quarter;
  amountCent: number;
}

interface Row {
  year: number;
  quarter: number;
  amount_cent: number;
}

/**
 * Lädt die 4 Quartals-Werte für ein Jahr. Fehlende Quartale werden mit 0
 * aufgefüllt — das UI kann immer 4 Inputs darstellen, ohne erst INSERTen
 * zu müssen.
 */
export async function listPrepayments(year: number): Promise<PrepaymentRow[]> {
  const rows = await select<Row>(
    `SELECT year, quarter, amount_cent FROM tax_prepayments WHERE year = ? ORDER BY quarter`,
    [year],
  );
  const byQuarter = new Map<number, number>();
  for (const r of rows) byQuarter.set(r.quarter, r.amount_cent);
  return ([1, 2, 3, 4] as Quarter[]).map((q) => ({
    year,
    quarter: q,
    amountCent: byQuarter.get(q) ?? 0,
  }));
}

/** Setzt (upsert) den Betrag für (year, quarter). */
export async function upsertPrepayment(
  year: number,
  quarter: Quarter,
  amountCent: number,
): Promise<void> {
  await execute(
    `INSERT INTO tax_prepayments (year, quarter, amount_cent)
     VALUES (?, ?, ?)
     ON CONFLICT(year, quarter) DO UPDATE SET
       amount_cent = excluded.amount_cent,
       updated_at = unixepoch()`,
    [year, quarter, amountCent],
  );
}

/** Summe aller Vorauszahlungen für ein Jahr. 0 wenn keine erfasst. */
export async function sumPrepaymentsForYear(year: number): Promise<number> {
  const rows = await select<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cent), 0) AS total FROM tax_prepayments WHERE year = ?`,
    [year],
  );
  return rows[0]?.total ?? 0;
}

/** Liste der Jahre, für die irgendein Eintrag existiert. */
export async function listPrepaymentYears(): Promise<number[]> {
  const rows = await select<{ year: number }>(
    `SELECT DISTINCT year FROM tax_prepayments ORDER BY year DESC`,
  );
  return rows.map((r) => r.year);
}
