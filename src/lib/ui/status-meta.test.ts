import { describe, expect, it } from "vitest";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_VARIANT } from "../../routes/invoice/status";
import { REMINDER_STATUS, RECURRING_STATE, recurringState } from "../../routes/parts/entity/status";
import { statusMeta, type StatusTable } from "./status-meta";

describe("statusMeta", () => {
  const table: StatusTable<"open" | "paid"> = {
    open: { label: "Offen", variant: "warning" },
    paid: { label: "Bezahlt", variant: "success" },
  };

  it("splits a status table into label and variant lookups", () => {
    const { label, variant } = statusMeta(table);
    expect(label).toEqual({ open: "Offen", paid: "Bezahlt" });
    expect(variant).toEqual({ open: "warning", paid: "success" });
  });
});

describe("status tables", () => {
  it("keeps the invoice vocabulary", () => {
    expect(INVOICE_STATUS_LABEL.partial).toBe("Teilbezahlt");
    expect(INVOICE_STATUS_VARIANT.cancelled).toBe("outline");
  });

  it("labels reminders and recurring templates with their own vocabulary", () => {
    expect(REMINDER_STATUS.sent).toEqual({ label: "Versendet", variant: "success" });
    expect(RECURRING_STATE[recurringState(true)].label).toBe("Aktiv");
    expect(RECURRING_STATE[recurringState(false)]).toEqual({ label: "Pausiert", variant: "secondary" });
  });
});
