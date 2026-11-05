import type { ReminderStatus } from "$lib/db/schema";
import type { StatusTable } from "$lib/ui/status-meta";

export const REMINDER_STATUS: StatusTable<ReminderStatus> = {
  draft: { label: "Entwurf", variant: "secondary" },
  sent: { label: "Versendet", variant: "success" },
};

export type RecurringState = "active" | "paused";

export const RECURRING_STATE: StatusTable<RecurringState> = {
  active: { label: "Aktiv", variant: "default" },
  paused: { label: "Pausiert", variant: "secondary" },
};

export const recurringState = (active: boolean): RecurringState => (active ? "active" : "paused");
