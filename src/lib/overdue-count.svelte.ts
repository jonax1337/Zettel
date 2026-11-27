import { countOverdueInvoices } from "$lib/db/reminders";

let overdueInvoiceCount = $state(0);
let latestRequest = 0;

/** Number of overdue invoices, shown on the sidebar entry; stays at the last known value when a refresh fails. */
export const overdueInvoices = {
  get count() {
    return overdueInvoiceCount;
  },
};

/** One small COUNT query; call it after anything that can make an invoice overdue or settle it. */
export async function refreshOverdueCount(): Promise<void> {
  const request = ++latestRequest;
  try {
    const count = await countOverdueInvoices();
    if (request === latestRequest) overdueInvoiceCount = count;
  } catch (e) {
    console.error("Counting overdue invoices failed", e);
  }
}
