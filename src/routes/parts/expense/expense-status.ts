import type { BadgeVariant } from "$lib/ui/Badge.svelte";
import type { ExpenseStatus } from "$lib/db/schema";

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: "Entwurf",
  open: "Offen",
  paid: "Bezahlt",
  cancelled: "Storniert",
};

export const EXPENSE_STATUS_VARIANT: Record<ExpenseStatus, BadgeVariant> = {
  draft: "secondary",
  open: "warning",
  paid: "success",
  cancelled: "outline",
};

/** Order of the status filter in the expense list. */
export const EXPENSE_STATUS_FILTER_ORDER: ExpenseStatus[] = ["open", "paid", "draft", "cancelled"];
