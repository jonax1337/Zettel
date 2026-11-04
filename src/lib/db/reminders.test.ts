import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, insert, select, getInvoice, loadCreditedCent, drawNextNumber, loadSettings } = vi.hoisted(() => ({
  execute: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  getInvoice: vi.fn(),
  loadCreditedCent: vi.fn(),
  drawNextNumber: vi.fn(),
  loadSettings: vi.fn(),
}));
vi.mock("./client", () => ({ execute, insert, select }));
vi.mock("./invoices", () => ({ getInvoice, loadCreditedCent }));
vi.mock("./numbering", () => ({ drawNextNumber }));
vi.mock("./queries", () => ({ loadSettings }));

import {
  buildReminderDraft,
  createReminder,
  levelLabel,
  listOverdueInvoices,
  listReminders,
  remindableAmountCents,
  updateReminder,
  type ReminderDraft,
} from "./reminders";

const draftReminderRow = {
  id: 7,
  number: "MA-2026-0001",
  invoice_id: 3,
  invoice_snapshot: "{}",
  level: 1,
  issue_date: 1000,
  due_date: 2000,
  fee_cents: 500,
  interest_cents: 0,
  original_total_cents: 10000,
  total_due_cents: 10500,
  status: "draft",
  body_text: "Bitte zahlen",
  pdf_path: null,
  notes: "interne Notiz",
  created_at: 1,
  updated_at: 1,
  sent_at: null,
};

const draft: ReminderDraft = {
  invoiceId: 3,
  level: 1,
  issueDate: 1000,
  dueDate: 2000,
  feeCents: 500,
  interestCents: 100,
  bodyText: "Bitte zahlen",
  notes: null,
};

function remindableInvoice(overrides: Record<string, unknown> = {}) {
  return {
    invoice: {
      id: 3,
      number: "RE-2026-0001",
      status: "sent",
      isCreditNote: false,
      total: 10000,
      amountPaidCent: 0,
      issueDate: 10,
      dueDate: 20,
      customerSnapshot: '{"name":"Acme"}',
      ...overrides,
    },
    items: [],
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  execute.mockReset();
  insert.mockReset();
  select.mockReset();
  getInvoice.mockReset();
  loadCreditedCent.mockReset();
  drawNextNumber.mockReset();
});

describe("updateReminder", () => {
  it("clears notes when the patch sets them to null", async () => {
    select.mockResolvedValueOnce([draftReminderRow]);

    await updateReminder(7, { notes: null });

    const [, binds] = execute.mock.calls[0];
    expect(binds[6]).toBeNull();
  });

  it("keeps notes when the patch leaves them out", async () => {
    select.mockResolvedValueOnce([draftReminderRow]);

    await updateReminder(7, { feeCents: 1000 });

    const [, binds] = execute.mock.calls[0];
    expect(binds[6]).toBe("interne Notiz");
  });

  it("recomputes the total due from original total, fee and interest", async () => {
    select.mockResolvedValueOnce([draftReminderRow]);

    await updateReminder(7, { feeCents: 1000, interestCents: 250 });

    const [, binds] = execute.mock.calls[0];
    expect(binds[4]).toBe(11250);
  });

  it("rejects reminders that are no longer drafts", async () => {
    select.mockResolvedValueOnce([{ ...draftReminderRow, status: "sent" }]);

    await expect(updateReminder(7, { feeCents: 1 })).rejects.toThrow("Nur Entwürfe");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("createReminder", () => {
  beforeEach(() => {
    drawNextNumber.mockResolvedValue("MA-2026-0001");
    insert.mockResolvedValue(42);
    loadCreditedCent.mockResolvedValue(0);
  });

  it.each(["sent", "partial"])("creates a reminder for a %s invoice", async (status) => {
    getInvoice.mockResolvedValue(remindableInvoice({ status }));

    expect(await createReminder(draft)).toBe(42);

    const [, binds] = insert.mock.calls[0];
    expect(binds).toContain("MA-2026-0001");
    expect(binds).toContain(10600);
  });

  it("demands only the open amount of a partially paid invoice", async () => {
    getInvoice.mockResolvedValue(remindableInvoice({ status: "partial", amountPaidCent: 4000 }));

    await createReminder(draft);

    const [, binds] = insert.mock.calls[0];
    expect(binds).toContain(6000);
    expect(binds).toContain(6600);
    expect(binds).not.toContain(10600);
  });

  it.each(["draft", "paid", "cancelled"])("rejects a %s invoice", async (status) => {
    getInvoice.mockResolvedValue(remindableInvoice({ status }));

    await expect(createReminder(draft)).rejects.toThrow("versendete oder teilbezahlte");
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects credit notes", async () => {
    getInvoice.mockResolvedValue(remindableInvoice({ isCreditNote: true }));

    await expect(createReminder(draft)).rejects.toThrow("Stornorechnungen");
  });

  it("rejects an invoice offset by an issued credit note without drawing a number", async () => {
    getInvoice.mockResolvedValue(remindableInvoice());
    loadCreditedCent.mockResolvedValue(10000);

    await expect(createReminder(draft)).rejects.toThrow("storniert");
    expect(drawNextNumber).not.toHaveBeenCalled();
  });

  it("demands only what payments and a partial credit note leave open", async () => {
    getInvoice.mockResolvedValue(remindableInvoice({ status: "partial", amountPaidCent: 4000 }));
    loadCreditedCent.mockResolvedValue(2500);

    await createReminder(draft);

    const [, binds] = insert.mock.calls[0];
    expect(binds).toContain(3500);
    expect(binds).toContain(4100);
  });
});

describe("buildReminderDraft", () => {
  const settings = {
    reminderFeeL1Cents: 500,
    reminderDaysL1: 7,
    reminderTextL1: "Bitte zahlen",
  };

  beforeEach(() => {
    loadSettings.mockResolvedValue(settings);
  });

  it("takes the EUR fee setting unchanged for a EUR invoice", async () => {
    getInvoice.mockResolvedValue(remindableInvoice({ currency: "EUR", exchangeRate: null }));

    expect((await buildReminderDraft(3, 1)).feeCents).toBe(500);
  });

  it("converts the EUR fee setting into the invoice currency with the invoice's rate", async () => {
    getInvoice.mockResolvedValue(remindableInvoice({ currency: "USD", exchangeRate: "1.0832" }));

    const draft = await buildReminderDraft(3, 1);

    expect(draft.feeCents).toBe(542);
    expect(draft.interestCents).toBe(0);
  });

  it("leaves the fee empty for a foreign-currency invoice without a usable rate", async () => {
    getInvoice.mockResolvedValue(remindableInvoice({ currency: "USD", exchangeRate: null }));

    expect((await buildReminderDraft(3, 1)).feeCents).toBe(0);
  });
});

describe("listReminders", () => {
  it("carries the currency of the reminded invoice and defaults to EUR", async () => {
    select.mockResolvedValueOnce([
      { ...draftReminderRow, invoice_currency: "USD" },
      { ...draftReminderRow, id: 8, invoice_currency: null },
    ]);

    const rows = await listReminders();

    expect(rows.map((r) => r.currency)).toEqual(["USD", "EUR"]);
  });

  it("falls back to dashes and warns for an unreadable invoice snapshot", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    select.mockResolvedValueOnce([{ ...draftReminderRow, invoice_snapshot: "{" }]);

    const [row] = await listReminders();

    expect(row.invoiceNumber).toBe("—");
    expect(row.customerName).toBe("—");
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("listOverdueInvoices", () => {
  it("returns nothing without querying reminders when no invoice is overdue", async () => {
    select.mockResolvedValueOnce([]);

    expect(await listOverdueInvoices()).toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("lists sent and partially paid invoices but leaves out those offset by an issued credit note", async () => {
    select.mockResolvedValueOnce([]);

    await listOverdueInvoices();

    const [sql] = select.mock.calls[0];
    expect(sql).toContain("i.status IN ('sent','partial')");
    expect(sql).toContain("credit_note.corrects_invoice_id = i.id");
    expect(sql).toContain("credit_note.status NOT IN ('draft','cancelled')");
  });

  it("attaches the existing reminder levels and ignores unknown ones", async () => {
    const dayAgo = Math.floor(Date.now() / 1000) - 3 * 86400 - 60;
    select
      .mockResolvedValueOnce([
        { id: 3, number: "RE-1", due_date: dayAgo, total: 10000, credited_cent: 0, customer_name: null },
      ])
      .mockResolvedValueOnce([
        { invoice_id: 3, level: 1 },
        { invoice_id: 3, level: 9 },
      ]);

    const [overdue] = await listOverdueInvoices();

    expect(overdue.existingReminderLevels).toEqual([1]);
    expect(overdue.daysOverdue).toBe(3);
    expect(overdue.customerName).toBe("—");
  });

  it("carries what issued credit notes take off, so the list shows the reduced open amount", async () => {
    const dayAgo = Math.floor(Date.now() / 1000) - 86400;
    select
      .mockResolvedValueOnce([
        { id: 3, number: "RE-1", due_date: dayAgo, total: 10000, amount_paid_cent: 1000, credited_cent: 2500, customer_name: "Acme" },
      ])
      .mockResolvedValueOnce([]);

    const [overdue] = await listOverdueInvoices();

    expect(remindableAmountCents(overdue.invoice)).toBe(6500);
  });
});

describe("levelLabel", () => {
  it("names each level", () => {
    expect([1, 2, 3].map((l) => levelLabel(l as 1 | 2 | 3))).toEqual([
      "Zahlungserinnerung",
      "Mahnung",
      "Letzte Mahnung",
    ]);
  });
});
