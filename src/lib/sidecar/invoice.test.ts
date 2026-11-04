import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() =>
  vi.fn(async (command: string, _args?: Record<string, unknown>): Promise<unknown> => {
    if (command === "get_documents_root") return "C:/Users/x/OneDrive/Dokumente/Zettel";
    if (command === "generate_invoice") return { success: false, error: { code: "x", message: "x" } };
    return null;
  }),
);
const storedInvoice = vi.hoisted(() => ({
  id: 1,
  number: "RE-2026-0001",
  status: "sent",
  pdfPath: "C:/Users/x/Documents/Zettel/Rechnungen/RE-2026-0001.pdf",
  customerSnapshot: "{}",
  total: 1000,
  issueDate: 0,
  isCreditNote: false,
  skontoPercent: null,
  skontoDays: null,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({ join: async (...parts: string[]) => parts.join("/") }));
vi.mock("$lib/db/queries", () => ({ loadSettings }));
vi.mock("$lib/db/invoices", () => ({
  getInvoice,
  isDraftNumber: () => false,
  issueInvoice: vi.fn(),
  recordGeneratedPdf: vi.fn(),
}));
const completeCompany = vi.hoisted(() => ({
  companyName: "Muster GmbH",
  street: "Hauptstr. 1",
  postalCode: "10115",
  city: "Berlin",
  taxNumber: "12/345/67890",
  vatId: null,
}));
const loadSettings = vi.hoisted(() => vi.fn(async () => completeCompany));
const getInvoice = vi.hoisted(() => vi.fn(async () => ({ invoice: storedInvoice, items: [] })));
vi.mock("$lib/validator", () => ({ validatePdf: vi.fn() }));

import { generateInvoicePdf } from "./invoice";

describe("generateInvoicePdf", () => {
  beforeEach(() => {
    invoke.mockClear();
    getInvoice.mockClear();
  });

  it("hands the stored PDF path to the archive, so a PDF from an older root stays in the version chain", async () => {
    await generateInvoicePdf(1);

    expect(invoke).toHaveBeenCalledWith("archive_pdf_version", {
      path: "C:/Users/x/OneDrive/Dokumente/Zettel/Rechnungen/RE-2026-0001.pdf",
      previous: "C:/Users/x/Documents/Zettel/Rechnungen/RE-2026-0001.pdf",
    });
  });

  it("refuses incomplete company data before the invoice is loaded for issuing", async () => {
    loadSettings.mockResolvedValueOnce({ ...completeCompany, companyName: "" });

    const res = await generateInvoicePdf(1);

    expect(res).toMatchObject({ success: false, error: { code: "company_incomplete" } });
    expect(getInvoice).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith("generate_invoice", expect.anything());
  });
});
