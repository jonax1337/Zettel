import { push } from "svelte-spa-router";
import { SvelteSet } from "svelte/reactivity";
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

/** Templates with an invoice being generated; buttons disable on membership so a double click cannot bill twice. */
export const generatingRecurringIds = new SvelteSet<number>();

export async function generateInvoiceAndOpen(recurringId: number): Promise<void> {
  if (generatingRecurringIds.has(recurringId)) return;
  generatingRecurringIds.add(recurringId);
  try {
    const invoiceId = await generateInvoiceFromRecurring(recurringId);
    toast.success("Rechnung erzeugt");
    push(`/invoices/${invoiceId}`);
  } catch (e) {
    toast.error("Erzeugen fehlgeschlagen", String(e));
  } finally {
    generatingRecurringIds.delete(recurringId);
  }
}
