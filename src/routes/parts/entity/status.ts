import type { ReminderStatus } from "$lib/db/schema";
import type { StatusTable } from "$lib/ui/status-meta";

export const REMINDER_STATUS: StatusTable<ReminderStatus> = {
  draft: { label: "Entwurf", variant: "draft" },
  // A sent reminder still waits for the payment, like a sent invoice.
  sent: { label: "Versendet", variant: "open" },
};

export type RecurringState = "active" | "paused";

export const RECURRING_STATE: StatusTable<RecurringState> = {
  active: { label: "Aktiv", variant: "paid" },
  paused: { label: "Pausiert", variant: "calm" },
};

export const recurringState = (active: boolean): RecurringState => (active ? "active" : "paused");
