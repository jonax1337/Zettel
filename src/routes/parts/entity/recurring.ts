import { push } from "svelte-spa-router";
import { toast } from "$lib/ui";
import { generateInvoiceFromRecurring } from "$lib/db/recurring";
import type { RecurringInterval } from "$lib/db/schema";

export const RECURRING_INTERVAL_LABEL: Record<RecurringInterval, string> = {
  monthly: "Monatlich",
  quarterly: "Quartalsweise",
  yearly: "Jährlich",
};

export const RECURRING_INTERVAL_ITEMS = (
  Object.entries(RECURRING_INTERVAL_LABEL) as [RecurringInterval, string][]
).map(([value, label]) => ({ value, label }));

export async function generateInvoiceAndOpen(recurringId: number): Promise<void> {
  try {
    const invoiceId = await generateInvoiceFromRecurring(recurringId);
    toast.success("Rechnung erzeugt");
    push(`/invoices/${invoiceId}`);
  } catch (e) {
    toast.error("Erzeugen fehlgeschlagen", String(e));
  }
}
