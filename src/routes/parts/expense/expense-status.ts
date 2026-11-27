import type { ExpenseStatus } from "$lib/db/schema";
import type { StatusTable } from "$lib/ui/status-meta";

export const EXPENSE_STATUS: StatusTable<ExpenseStatus> = {
  draft: { label: "Entwurf", variant: "draft" },
  open: { label: "Offen", variant: "open" },
  paid: { label: "Bezahlt", variant: "paid" },
  cancelled: { label: "Storniert", variant: "calm" },
};

/** Order of the status filter in the expense list. */
export const EXPENSE_STATUS_FILTER_ORDER: ExpenseStatus[] = ["open", "paid", "draft", "cancelled"];
