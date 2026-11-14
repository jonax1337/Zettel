import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeDefault = vi.hoisted(
  () =>
    async (command: string, _args?: Record<string, unknown>): Promise<unknown> => {
      if (command === "get_documents_root") return "C:/Users/x/OneDrive/Dokumente/Zettel";
      if (command === "generate_invoice") return { success: false, error: { code: "x", message: "x" } };
      if (command === "generate_xrechnung") {
        return { success: true, xmlPath: "C:/Users/x/OneDrive/Dokumente/Zettel/Rechnungen/RE-2026-0001.xml" };
      }
      return null;
    },
);
const invoke = vi.hoisted(() => vi.fn(invokeDefault));
const storedInvoice = vi.hoisted(() => ({
  id: 1,
  number: "RE-2026-0001",
  status: "sent",
  pdfPath: "C:/Users/x/Documents/Zettel/Rechnungen/RE-2026-0001.pdf",
  customerSnapshot: "{}",
  buyerReference: null as string | null,
  total: 1000,
  issueDate: 0,
  isCreditNote: false,
  skontoPercent: null,
  skontoDays: null,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({ join: async (...parts: string[]) => parts.join("/") }));
vi.mock("$lib/db/queries", () => ({ loadSettings, getCustomer }));
vi.mock("$lib/db/invoices", () => ({
  getInvoice,
  isDraftNumber,
  issueInvoice: vi.fn(),
  recordGeneratedPdf: vi.fn(),
}));
const completeCompany = vi.hoisted(() => ({
  companyName: "Muster GmbH",
  ownerName: "",
  email: "",
  street: "Hauptstr. 1",
  postalCode: "10115",
  city: "Berlin",
  taxNumber: "12/345/67890",
  vatId: null,
}));
const loadSettings = vi.hoisted(() => vi.fn(async (): Promise<Record<string, unknown>> => completeCompany));
const getCustomer = vi.hoisted(() => vi.fn(async (_id: number): Promise<unknown> => null));
const isDraftNumber = vi.hoisted(() => vi.fn((_number: string) => false));
const getInvoice = vi.hoisted(() => vi.fn(async () => ({ invoice: storedInvoice, items: [] })));
vi.mock("$lib/validator", () => ({ validatePdf: vi.fn() }));

import { exportInvoiceXrechnung, generateInvoicePdf } from "./invoice";

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

describe("exportInvoiceXrechnung", () => {
  const xrechnungCompany = {
    ...completeCompany,
    ownerName: "Jonas Laux",
    phone: "+49 30 1234567",
    email: "rechnung@laux.digital",
    vatId: "DE123456789",
    bankIban: "DE89370400440532013000",
  };
  const authority = {
    name: "Bundesamt für Beispielwesen",
    street: "Amtsplatz 1",
    postalCode: "53113",
    city: "Bonn",
    country: "DE",
    email: "eingangsrechnung@bfb.example.de",
    vatId: null,
  };
  const xrechnungInvoice = {
    ...storedInvoice,
    buyerReference: "04011000-1234512345-35",
    customerSnapshot: JSON.stringify(authority),
  };

  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(invokeDefault);
    isDraftNumber.mockReturnValue(false);
    getCustomer.mockResolvedValue(null);
    loadSettings.mockResolvedValue(xrechnungCompany);
    getInvoice.mockResolvedValue({ invoice: xrechnungInvoice, items: [] });
  });

  it("returns the missing fields instead of calling the sidecar", async () => {
    getInvoice.mockResolvedValue({ invoice: { ...xrechnungInvoice, buyerReference: null }, items: [] });

    const res = await exportInvoiceXrechnung(1);

    expect(res).toEqual({ status: "incomplete", missing: ["Leitweg-ID / Käuferreferenz"] });
    expect(invoke).not.toHaveBeenCalledWith("generate_xrechnung", expect.anything());
  });

  it("writes the XML as .xml next to the PDF and returns its path", async () => {
    const res = await exportInvoiceXrechnung(1);

    expect(res).toEqual({
      status: "exported",
      xmlPath: "C:/Users/x/OneDrive/Dokumente/Zettel/Rechnungen/RE-2026-0001.xml",
    });
    const [, args] = invoke.mock.calls.find(([command]) => command === "generate_xrechnung")!;
    expect(args).toMatchObject({
      payload: {
        outputPath: "C:/Users/x/OneDrive/Dokumente/Zettel/Rechnungen/RE-2026-0001.xml",
        invoice: { buyerReference: "04011000-1234512345-35" },
        company: { ownerName: "Jonas Laux", phone: "+49 30 1234567" },
        customer: { email: "eingangsrechnung@bfb.example.de" },
      },
    });
  });

  it("reads a Leitweg-ID and e-mail the customer gained after issuing from the live customer", async () => {
    getInvoice.mockResolvedValue({
      invoice: {
        ...xrechnungInvoice,
        buyerReference: null,
        customerSnapshot: JSON.stringify({ ...authority, email: null }),
      },
      items: [],
    });
    getCustomer.mockResolvedValue({ leitwegId: "04011000-1234512345-35", email: "amt@bfb.example.de" });

    const res = await exportInvoiceXrechnung(1);

    expect(res.status).toBe("exported");
    const [, args] = invoke.mock.calls.find(([command]) => command === "generate_xrechnung")!;
    expect(args).toMatchObject({
      payload: {
        invoice: { buyerReference: "04011000-1234512345-35" },
        customer: { email: "amt@bfb.example.de" },
      },
    });
  });

  it("still lists the Leitweg-ID when neither the invoice nor the customer has one", async () => {
    getInvoice.mockResolvedValue({ invoice: { ...xrechnungInvoice, buyerReference: null }, items: [] });
    getCustomer.mockResolvedValue({ leitwegId: null, email: "amt@bfb.example.de" });

    expect(await exportInvoiceXrechnung(1)).toEqual({
      status: "incomplete",
      missing: ["Leitweg-ID / Käuferreferenz"],
    });
  });

  it("refuses a draft before anything is checked or written", async () => {
    isDraftNumber.mockReturnValue(true);

    await expect(exportInvoiceXrechnung(1)).rejects.toThrow("Entwürfe");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("fails with the sidecar's error code and message", async () => {
    invoke.mockImplementation(async (command) =>
      command === "generate_xrechnung"
        ? { success: false, error: { code: "RENDER_FAILED", message: "kaputt" } }
        : invokeDefault(command),
    );

    await expect(exportInvoiceXrechnung(1)).rejects.toThrow("RENDER_FAILED: kaputt");
  });
});
