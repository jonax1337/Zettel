import { describe, expect, it } from "vitest";
import { INVOICE_STATUS, INVOICE_STATUS_LABEL, INVOICE_STATUS_VARIANT } from "../../routes/invoice/status";
import { REMINDER_STATUS, RECURRING_STATE, recurringState } from "../../routes/parts/entity/status";
import { OFFER_STATUS } from "../../routes/offer/status";
import { EXPENSE_STATUS } from "../../routes/parts/expense/expense-status";
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
    expect(INVOICE_STATUS_VARIANT.cancelled).toBe("calm");
  });

  it("labels reminders and recurring templates with their own vocabulary", () => {
    expect(REMINDER_STATUS.sent).toEqual({ label: "Versendet", variant: "open" });
    expect(RECURRING_STATE[recurringState(true)].label).toBe("Aktiv");
    expect(RECURRING_STATE[recurringState(false)]).toEqual({ label: "Pausiert", variant: "calm" });
  });
});

describe("status tones", () => {
  const tone = <S extends string>(table: StatusTable<S>, status: S) => table[status].variant;

  it("gives invoice statuses the tones of the design", () => {
    expect(tone(INVOICE_STATUS, "draft")).toBe("draft");
    expect(tone(INVOICE_STATUS, "sent")).toBe("open");
    expect(tone(INVOICE_STATUS, "partial")).toBe("open");
    expect(tone(INVOICE_STATUS, "paid")).toBe("paid");
    expect(tone(INVOICE_STATUS, "cancelled")).toBe("calm");
  });

  it("gives offer statuses the tones of the design", () => {
    expect(tone(OFFER_STATUS, "draft")).toBe("draft");
    expect(tone(OFFER_STATUS, "sent")).toBe("open");
    expect(tone(OFFER_STATUS, "accepted")).toBe("paid");
    expect(tone(OFFER_STATUS, "rejected")).toBe("calm");
    expect(tone(OFFER_STATUS, "expired")).toBe("calm");
  });

  it("gives expense statuses the tones of the design", () => {
    expect(tone(EXPENSE_STATUS, "draft")).toBe("draft");
    expect(tone(EXPENSE_STATUS, "open")).toBe("open");
    expect(tone(EXPENSE_STATUS, "paid")).toBe("paid");
    expect(tone(EXPENSE_STATUS, "cancelled")).toBe("calm");
  });
});
