import type { ExpenseStatus } from "$lib/db/schema";
import { statusMeta, type StatusTable } from "$lib/ui/status-meta";

export const EXPENSE_STATUS: StatusTable<ExpenseStatus> = {
  draft: { label: "Entwurf", variant: "secondary" },
  open: { label: "Offen", variant: "warning" },
  paid: { label: "Bezahlt", variant: "success" },
  cancelled: { label: "Storniert", variant: "outline" },
};

export const { label: EXPENSE_STATUS_LABEL, variant: EXPENSE_STATUS_VARIANT } =
  statusMeta(EXPENSE_STATUS);

/** Order of the status filter in the expense list. */
export const EXPENSE_STATUS_FILTER_ORDER: ExpenseStatus[] = ["open", "paid", "draft", "cancelled"];
