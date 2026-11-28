import { describe, expect, it } from "vitest";
import { actionsAt } from "./action-plan";
import { planInvoiceActions, type InvoiceActionState } from "./invoice-action-plan";
import { invoiceMenuEntries } from "./invoice-menu";
import { offerMenuEntries } from "./offer-menu";
import { planOfferActions } from "../../offer/offer-actions";

const EVERYTHING: InvoiceActionState = {
  status: "sent",
  isCreditNote: false,
  isNumbered: true,
  hasPdf: true,
  isOverdue: true,
  canRecordPayment: true,
  creatableReminderLevel: null,
  canExportXrechnung: true,
  canCreateCreditNote: true,
  canReopenDraft: true,
  canReleaseTime: true,
  canDiscard: true,
};

const CONTEXT = {
  busy: false,
  mail: { hasAddress: true, mailProgramOpen: false },
  settlesRemainder: false,
  previewing: false,
  onSelect: () => {},
};

describe("invoiceMenuEntries", () => {
  it("has an entry for every action the plan puts into the menu", () => {
    const states: InvoiceActionState[] = [
      EVERYTHING,
      { ...draftState(), status: "draft" },
      { ...draftState(), status: "draft", isNumbered: true, hasPdf: true },
      { ...EVERYTHING, status: "paid", canRecordPayment: false },
      { ...EVERYTHING, creatableReminderLevel: 2 },
    ];
    for (const state of states) {
      const ids = actionsAt(planInvoiceActions(state), "menu");
      expect(invoiceMenuEntries(ids, CONTEXT).map((entry) => entry.id)).toEqual(ids);
    }
  });

  it("names the preview entry and shows it busy while the draft PDF is made", () => {
    const label = (previewing: boolean) => invoiceMenuEntries(["preview-pdf"], { ...CONTEXT, previewing })[0].label;
    expect(label(false)).toBe("PDF-Vorschau");
    expect(label(true)).toBe("Erstelle Vorschau…");
  });

  it("calls back with the id of the chosen entry", () => {
    const chosen: string[] = [];
    const [entry] = invoiceMenuEntries(["export-xrechnung"], { ...CONTEXT, onSelect: (id) => chosen.push(id) });
    entry.onSelect();
    expect(chosen).toEqual(["export-xrechnung"]);
  });

  it("names the payment entry after what it books", () => {
    const label = (settlesRemainder: boolean) =>
      invoiceMenuEntries(["mark-paid"], { ...CONTEXT, settlesRemainder })[0].label;
    expect(label(false)).toBe("Als bezahlt markieren");
    expect(label(true)).toBe("Restbetrag als bezahlt markieren");
  });

  it("disables everything while another action runs", () => {
    const entries = invoiceMenuEntries(["mark-paid", "delete"], { ...CONTEXT, busy: true });
    expect(entries.every((entry) => entry.disabled)).toBe(true);
  });

  it("explains a disabled mail entry when the customer has no address, and keeps the other entries usable", () => {
    const entries = invoiceMenuEntries(["send-mail", "mark-paid"], {
      ...CONTEXT,
      mail: { hasAddress: false, mailProgramOpen: false },
    });
    expect(entries.map((entry) => entry.disabled)).toEqual([true, false]);
    expect(entries[0].hint).toBe("Beim Kunden ist keine E-Mail-Adresse hinterlegt.");
    expect(entries[1].hint).toBeUndefined();
  });

  it("shows the feedback text while the mail program is open", () => {
    const [entry] = invoiceMenuEntries(["send-mail"], { ...CONTEXT, mail: { hasAddress: true, mailProgramOpen: true } });
    expect(entry.label).toBe("Mail-Programm geöffnet…");
    expect(entry.disabled).toBe(true);
    expect(entry.hint).toBeUndefined();
  });

  it("offers the mail entry as usual with an address, unless another action runs", () => {
    expect(invoiceMenuEntries(["send-mail"], CONTEXT)[0]).toMatchObject({ label: "Per E-Mail senden", disabled: false });
    expect(invoiceMenuEntries(["send-mail"], { ...CONTEXT, busy: true })[0].disabled).toBe(true);
  });

  it("marks the entries that undo or remove the invoice as destructive, in their own groups", () => {
    const entries = invoiceMenuEntries(["mark-paid", "create-credit-note", "delete"], CONTEXT);
    expect(entries.map((entry) => entry.group)).toEqual([0, 1, 2]);
    expect(entries.map((entry) => !!entry.destructive)).toEqual([false, true, true]);
  });
});

describe("offerMenuEntries", () => {
  const context = { busy: false, previewing: false, onSelect: () => {} };

  it("has an entry for every action the offer plan puts into the menu", () => {
    for (const status of ["draft", "sent", "accepted", "rejected", "expired"] as const) {
      const ids = actionsAt(planOfferActions({ status, convertedInvoiceId: null, hasPdf: true }), "menu");
      expect(offerMenuEntries(ids, context).map((entry) => entry.id)).toEqual(ids);
    }
  });

  it("names the preview entry and shows it busy while the draft PDF is made", () => {
    const label = (previewing: boolean) => offerMenuEntries(["preview-pdf"], { ...context, previewing })[0].label;
    expect(label(false)).toBe("PDF-Vorschau");
    expect(label(true)).toBe("Erstelle Vorschau…");
  });

  it("calls back with the id of the chosen entry and is disabled while another action runs", () => {
    const chosen: string[] = [];
    const [entry] = offerMenuEntries(["preview-pdf"], { ...context, onSelect: (id) => chosen.push(id) });
    entry.onSelect();
    expect(chosen).toEqual(["preview-pdf"]);
    expect(offerMenuEntries(["preview-pdf"], { ...context, busy: true })[0].disabled).toBe(true);
  });
});

function draftState(): InvoiceActionState {
  return { ...EVERYTHING, isNumbered: false, hasPdf: false, canRecordPayment: false, canExportXrechnung: false, canCreateCreditNote: false };
}
