/** Only finished entries that are on no invoice can be picked for billing. */
export function isBillable(entry: { invoiceId: number | null; durationMinutes: number | null }): boolean {
  return entry.invoiceId === null && entry.durationMinutes !== null;
}

/** What to do next, per place the explanation is shown. */
export const BAR_REMEDY = "Wähle nur Einträge eines Kunden aus.";
export const SUMMARY_REMEDY = "Filtere auf einen Kunden, um seine offenen Zeiten abzurechnen.";

/** Why the picked entries cannot become one invoice, or null when they can. */
export function billingBlocker(selected: { customerId: number }[], remedy: string): string | null {
  const customers = new Set(selected.map((entry) => entry.customerId));
  return customers.size > 1 ? `Eine Rechnung kann nur Einträge eines Kunden enthalten. ${remedy}` : null;
}
