/** Only finished entries that are on no invoice can be picked for billing. */
export function isBillable(entry: { invoiceId: number | null; durationMinutes: number | null }): boolean {
  return entry.invoiceId === null && entry.durationMinutes !== null;
}

/** Why the picked entries cannot become one invoice, or null when they can. */
export function billingBlocker(selected: { customerId: number }[]): string | null {
  const customers = new Set(selected.map((entry) => entry.customerId));
  return customers.size > 1 ? "Eine Rechnung kann nur Einträge eines Kunden enthalten." : null;
}
