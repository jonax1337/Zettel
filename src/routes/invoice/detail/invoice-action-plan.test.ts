import { describe, expect, it } from "vitest";
import { actionsAt } from "./action-plan";
import { planInvoiceActions, type InvoiceActionState } from "./invoice-action-plan";

function state(overrides: Partial<InvoiceActionState> = {}): InvoiceActionState {
  return {
    status: "sent",
    isCreditNote: false,
    isNumbered: true,
    hasPdf: true,
    isOverdue: false,
    canRecordPayment: true,
    creatableReminderLevel: null,
    canExportXrechnung: true,
    canCreateCreditNote: true,
    canReopenDraft: false,
    canReleaseTime: false,
    canDiscard: false,
    ...overrides,
  };
}

const DRAFT = {
  status: "draft",
  isNumbered: false,
  hasPdf: false,
  canRecordPayment: false,
  canExportXrechnung: false,
  canCreateCreditNote: false,
  canDiscard: true,
} satisfies Partial<InvoiceActionState>;

const OVERDUE = { isOverdue: true, creatableReminderLevel: 1 } satisfies Partial<InvoiceActionState>;

function mainOf(plan: ReturnType<typeof planInvoiceActions>) {
  return actionsAt(plan, "main");
}

describe("planInvoiceActions: the main action", () => {
  it("issues a draft", () => {
    expect(mainOf(planInvoiceActions(state(DRAFT)))).toEqual(["issue"]);
  });

  it("issues a draft credit note", () => {
    expect(mainOf(planInvoiceActions(state({ ...DRAFT, isCreditNote: true })))).toEqual(["issue"]);
  });

  it("issues a reopened draft that already has a number and a PDF", () => {
    expect(mainOf(planInvoiceActions(state({ ...DRAFT, isNumbered: true, hasPdf: true, canDiscard: false })))).toEqual([
      "issue",
    ]);
  });

  it("records a payment on an open invoice that is not due yet", () => {
    expect(mainOf(planInvoiceActions(state()))).toEqual(["record-payment"]);
  });

  it("records a payment on a partly paid invoice", () => {
    expect(mainOf(planInvoiceActions(state({ status: "partial" })))).toEqual(["record-payment"]);
  });

  it.each([1, 2, 3] as const)("creates the level %s reminder on an overdue invoice", (level) => {
    expect(mainOf(planInvoiceActions(state({ isOverdue: true, creatableReminderLevel: level })))).toEqual([
      "create-reminder",
    ]);
  });

  it("records a payment when the overdue invoice already got every reminder level", () => {
    const plan = planInvoiceActions(state({ isOverdue: true, creatableReminderLevel: null }));
    expect(mainOf(plan)).toEqual(["record-payment"]);
  });

  it.each([
    ["paid", { status: "paid", canRecordPayment: false }],
    ["cancelled", { status: "cancelled", canRecordPayment: false, canExportXrechnung: false }],
    ["fully reversed by a credit note", { canRecordPayment: false }],
    ["an issued credit note", { isCreditNote: true, canRecordPayment: false }],
  ] satisfies [string, Partial<InvoiceActionState>][])("has no main action for %s", (_name, overrides) => {
    expect(mainOf(planInvoiceActions(state(overrides)))).toEqual([]);
  });

  it("never marks more than one action as main", () => {
    const statuses = ["draft", "sent", "partial", "paid", "cancelled"] as const;
    for (const status of statuses) {
      for (const isOverdue of [false, true]) {
        for (const canRecordPayment of [false, true]) {
          for (const creatableReminderLevel of [null, 1, 3] as const) {
            const plan = planInvoiceActions(
              state({ status, isOverdue, canRecordPayment, creatableReminderLevel }),
            );
            expect(mainOf(plan).length).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe("planInvoiceActions: header buttons", () => {
  it("shows PDF, edit and mail around the main action of a draft", () => {
    const plan = planInvoiceActions(state({ ...DRAFT, isNumbered: true, hasPdf: true }));
    expect(actionsAt(plan, "header")).toEqual(["open-pdf", "edit", "send-mail"]);
  });

  it("gives a draft without a PDF the preview instead of a PDF button: issuing creates the real one", () => {
    const plan = planInvoiceActions(state(DRAFT));
    expect(actionsAt(plan, "header")).toEqual(["edit", "preview-pdf", "send-mail"]);
    expect([...actionsAt(plan, "header"), ...actionsAt(plan, "menu")]).not.toContain("generate-pdf");
  });

  it("previews a draft credit note too", () => {
    const plan = planInvoiceActions(state({ ...DRAFT, isCreditNote: true }));
    expect(actionsAt(plan, "header")).toContain("preview-pdf");
  });

  it("moves the preview of a reopened draft into the menu, where its old PDF already fills the header", () => {
    const plan = planInvoiceActions(state({ ...DRAFT, isNumbered: true, hasPdf: true, canDiscard: false }));
    expect(actionsAt(plan, "header")).not.toContain("preview-pdf");
    expect(actionsAt(plan, "menu")[0]).toBe("preview-pdf");
  });

  it("offers a discarded draft only the preview: no PDF with a placeholder number, no mail", () => {
    const plan = planInvoiceActions(state({ ...DRAFT, status: "cancelled", canDiscard: false }));
    expect(actionsAt(plan, "header")).toEqual(["preview-pdf"]);
    expect(actionsAt(plan, "menu")).not.toContain("send-mail");
  });

  it("leaves a cancelled invoice with a real number as it was", () => {
    const plan = planInvoiceActions(state({ status: "cancelled", hasPdf: false, canRecordPayment: false }));
    expect(actionsAt(plan, "header")).toEqual(["generate-pdf"]);
    expect(actionsAt(plan, "menu")).toContain("send-mail");
  });

  it.each([
    ["sent", { status: "sent" }],
    ["paid", { status: "paid", canRecordPayment: false }],
    ["overdue", OVERDUE],
  ] satisfies [string, Partial<InvoiceActionState>][])("offers no preview of an issued invoice (%s)", (_name, overrides) => {
    const plan = planInvoiceActions(state(overrides));
    expect(plan.map((action) => action.id)).not.toContain("preview-pdf");
  });

  it("keeps PDF creation reachable on an issued invoice without a PDF", () => {
    const plan = planInvoiceActions(state({ hasPdf: false }));
    expect(actionsAt(plan, "header")).toEqual(["generate-pdf", "send-mail"]);
    expect(actionsAt(plan, "menu")).not.toContain("regenerate-pdf");
  });

  it("shows PDF and mail next to the payment action of an open invoice", () => {
    expect(actionsAt(planInvoiceActions(state()), "header")).toEqual(["open-pdf", "send-mail"]);
  });

  it("moves the payment next to the reminder on an overdue invoice and mail into the menu", () => {
    const plan = planInvoiceActions(state(OVERDUE));
    expect(actionsAt(plan, "header")).toEqual(["open-pdf", "record-payment"]);
    expect(actionsAt(plan, "menu")).toContain("send-mail");
  });

  it("keeps mail in the header of an overdue invoice whose main action is the payment", () => {
    const plan = planInvoiceActions(state({ isOverdue: true }));
    expect(actionsAt(plan, "header")).toEqual(["open-pdf", "send-mail"]);
  });

  it("puts mail of a paid invoice into the menu", () => {
    const plan = planInvoiceActions(state({ status: "paid", canRecordPayment: false }));
    expect(actionsAt(plan, "header")).toEqual(["open-pdf"]);
    expect(actionsAt(plan, "menu")).toContain("send-mail");
  });

  it("lists header buttons before the main action", () => {
    const plan = planInvoiceActions(state(OVERDUE));
    expect(plan.map((action) => action.placement)).toEqual(["header", "header", "main", ...Array(6).fill("menu")]);
  });
});

describe("planInvoiceActions: the menu", () => {
  it("offers a draft the issue-without-PDF flow, the recurring template and discarding", () => {
    expect(actionsAt(planInvoiceActions(state(DRAFT)), "menu")).toEqual([
      "mark-sent",
      "save-recurring",
      "cancel",
      "delete",
    ]);
  });

  it("offers a credit note no recurring template", () => {
    const plan = planInvoiceActions(state({ isCreditNote: true, canRecordPayment: false, canCreateCreditNote: false }));
    expect(actionsAt(plan, "menu")).not.toContain("save-recurring");
  });

  it("lists every conditional entry in a fixed order", () => {
    const plan = planInvoiceActions(state({ canReleaseTime: true, canReopenDraft: true }));
    expect(actionsAt(plan, "menu")).toEqual([
      "mark-paid",
      "regenerate-pdf",
      "export-xrechnung",
      "save-recurring",
      "release-time",
      "create-credit-note",
      "reopen-draft",
    ]);
  });

  it("follows the capability flags", () => {
    const plan = planInvoiceActions(
      state({ canRecordPayment: false, canExportXrechnung: false, canCreateCreditNote: false }),
    );
    const menu = actionsAt(plan, "menu");
    expect(menu).not.toContain("mark-paid");
    expect(menu).not.toContain("export-xrechnung");
    expect(menu).not.toContain("create-credit-note");
  });

  it("offers each action once", () => {
    const plan = planInvoiceActions(state({ ...OVERDUE, canReleaseTime: true, canReopenDraft: true, canDiscard: true }));
    const ids = plan.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
