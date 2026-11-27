import { beforeEach, describe, expect, it, vi } from "vitest";

const HTML = "<html>sheet</html>";
const invoke = vi.hoisted(() =>
  vi.fn(async (command: string, _args?: Record<string, unknown>): Promise<unknown> => {
    if (command === "render_document_html") return { success: true, html: HTML };
    return null;
  }),
);
const company = vi.hoisted(() => ({
  companyName: "Muster GmbH",
  ownerName: "",
  email: "",
  street: "Hauptstr. 1",
  postalCode: "10115",
  city: "Berlin",
  taxNumber: "12/345/67890",
  vatId: null,
}));
const invoiceRow = vi.hoisted(() => ({
  id: 1,
  number: "RE-2026-0001",
  status: "sent",
  customerSnapshot: JSON.stringify({ name: "Kunde AG" }),
  customerId: 7,
  correctsInvoiceId: null as number | null,
  isCreditNote: false,
  total: 1000,
  issueDate: 0,
  skontoPercent: null,
  skontoDays: null,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({ join: async (...parts: string[]) => parts.join("/") }));
const getCustomer = vi.hoisted(() =>
  vi.fn(async (_id: number): Promise<unknown> => ({ customerNumber: "K-0007", name: "Kunde AG", country: "DE" })),
);
vi.mock("$lib/db/queries", () => ({ loadSettings: vi.fn(async () => company), getCustomer }));
const getInvoice = vi.hoisted(() => vi.fn(async (_id: number): Promise<unknown> => ({ invoice: invoiceRow, items: [] })));
const issueInvoice = vi.hoisted(() => vi.fn());
const recordGeneratedPdf = vi.hoisted(() => vi.fn());
vi.mock("$lib/db/invoices", () => ({
  getInvoice,
  isDraftNumber: (number: string) => number.startsWith("DRAFT-"),
  issueInvoice,
  recordGeneratedPdf,
}));
const getOffer = vi.hoisted(() => vi.fn());
vi.mock("$lib/db/offers", () => ({ getOffer }));
const getReminder = vi.hoisted(() => vi.fn());
vi.mock("$lib/db/reminders", () => ({ getReminder, levelLabel: () => "1. Mahnung" }));
vi.mock("$lib/validator", () => ({ validatePdf: vi.fn() }));

import { renderInvoiceSheet, renderOfferSheet, renderReminderSheet } from "./preview";

function sentPayload(): Record<string, any> {
  const call = invoke.mock.calls.find(([command]) => command === "render_document_html");
  return (call?.[1] as { payload: Record<string, any> }).payload;
}

function expectNothingWritten() {
  expect(issueInvoice).not.toHaveBeenCalled();
  expect(recordGeneratedPdf).not.toHaveBeenCalled();
  const commands = invoke.mock.calls.map(([command]) => command);
  expect(commands).toEqual(["render_document_html"]);
}

beforeEach(() => {
  invoke.mockClear();
  issueInvoice.mockClear();
  recordGeneratedPdf.mockClear();
  getInvoice.mockClear();
});

describe("renderInvoiceSheet", () => {
  it("shows a draft under its draft label and changes nothing", async () => {
    getInvoice.mockResolvedValueOnce({
      invoice: { ...invoiceRow, status: "draft", number: "DRAFT-0a1b2c3d4e5f6071" },
      items: [],
    });

    const html = await renderInvoiceSheet(1);

    expect(html).toBe(HTML);
    expect(sentPayload()).toMatchObject({ kind: "invoice", invoice: { number: "Entwurf #0a1b" } });
    expectNothingWritten();
  });

  it("shows a draft with the current customer, as issuing would snapshot it", async () => {
    getInvoice.mockResolvedValueOnce({
      invoice: { ...invoiceRow, status: "draft", number: "DRAFT-0a1b2c3d4e5f6071" },
      items: [],
    });
    getCustomer.mockResolvedValueOnce({ customerNumber: "K-0007", name: "Kunde AG (neu)", country: "DE" });

    await renderInvoiceSheet(1);

    expect(sentPayload().customer).toMatchObject({ name: "Kunde AG (neu)" });
  });

  it("keeps the stored customer of an issued invoice", async () => {
    getCustomer.mockResolvedValue({ name: "Changed since" });

    await renderInvoiceSheet(1);

    expect(sentPayload().customer).toMatchObject({ name: "Kunde AG" });
    getCustomer.mockResolvedValue({ customerNumber: "K-0007", name: "Kunde AG", country: "DE" });
  });

  it("keeps the real number of an issued invoice", async () => {
    await renderInvoiceSheet(1);

    expect(sentPayload()).toMatchObject({ kind: "invoice", invoice: { number: "RE-2026-0001" } });
    expectNothingWritten();
  });

  it("references the corrected invoice on a credit note", async () => {
    getInvoice.mockImplementation(async (id: number) =>
      id === 1
        ? { invoice: { ...invoiceRow, isCreditNote: true, correctsInvoiceId: 2 }, items: [] }
        : { invoice: { ...invoiceRow, id: 2, number: "RE-2026-0000", issueDate: 5 }, items: [] },
    );

    await renderInvoiceSheet(1);

    expect(sentPayload().invoice.correctsInvoice).toEqual({ number: "RE-2026-0000", issueDate: 5 });
    getInvoice.mockImplementation(async () => ({ invoice: invoiceRow, items: [] }));
  });

  it("throws the sidecar's message when it cannot render", async () => {
    invoke.mockResolvedValueOnce({
      success: false,
      error: { code: "RENDER_FAILED", message: "Missing required payload field: 'company'", details: "" },
    });

    await expect(renderInvoiceSheet(1)).rejects.toThrow("Missing required payload field: 'company'");
  });

  it("fails for an unknown invoice without calling the sidecar", async () => {
    getInvoice.mockResolvedValueOnce(null);

    await expect(renderInvoiceSheet(9)).rejects.toThrow("Invoice 9 not found");
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("renderOfferSheet", () => {
  it("sends the offer to the sidecar as an offer sheet", async () => {
    getOffer.mockResolvedValueOnce({
      offer: { number: "AN-2026-0001", customerSnapshot: JSON.stringify({ name: "Kunde AG" }), total: 1000, issueDate: 0 },
      items: [],
    });

    expect(await renderOfferSheet(3)).toBe(HTML);
    expect(sentPayload()).toMatchObject({ kind: "offer", offer: { number: "AN-2026-0001" } });
    expectNothingWritten();
  });
});

describe("renderReminderSheet", () => {
  it("sends the reminder to the sidecar as a reminder sheet", async () => {
    getReminder.mockResolvedValueOnce({
      number: "MA-2026-0001",
      level: 1,
      invoiceId: 1,
      invoiceSnapshot: JSON.stringify({ invoiceNumber: "RE-2026-0001", customerName: "Kunde AG" }),
    });

    expect(await renderReminderSheet(5)).toBe(HTML);
    expect(sentPayload()).toMatchObject({
      kind: "reminder",
      reminder: { number: "MA-2026-0001", levelLabel: "1. Mahnung" },
      invoice: { invoiceNumber: "RE-2026-0001" },
    });
    expectNothingWritten();
  });
});
