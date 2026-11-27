import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "$lib/db/sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("$lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/db/client")>()),
  ...(await import("$lib/db/sqlite-test-db")).sqliteClient(sqlite),
}));

const PREVIEW_PATH = "C:/cache/pdf-preview/Vorschau.pdf";
const invoke = vi.hoisted(() =>
  vi.fn(async (command: string, _args?: Record<string, unknown>): Promise<unknown> => {
    if (command === "generate_pdf_preview") return { success: true, pdfPath: "C:/cache/pdf-preview/Vorschau.pdf" };
    if (command === "generate_invoice" || command === "generate_offer") {
      return { success: true, pdfPath: "C:/documents/issued.pdf" };
    }
    if (command === "get_documents_root") return "C:/documents";
    if (command === "render_document_html") return { success: true, html: "<html>sheet</html>" };
    return null;
  }),
);
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({ join: async (...parts: string[]) => parts.join("/") }));
vi.mock("$lib/validator", () => ({
  validatePdf: vi.fn(async () => {
    throw new Error("no validator in this test");
  }),
}));

import { createInvoice, createCreditNoteFromInvoice, cancelInvoice, issueInvoice, reopenDraft } from "$lib/db/invoices";
import type { InvoiceFormInput } from "$lib/db/invoices";
import { createOffer } from "$lib/db/offers";
import type { OfferFormInput } from "$lib/db/offers";
import { generateInvoicePdf, previewInvoicePdf } from "./invoice";
import { generateOfferPdf, previewOfferPdf } from "./offer";
import { renderInvoiceSheet } from "./preview";
import { SETTINGS_MISSING_MESSAGE } from "./pdf-preview";
import { shownInvoiceNumber } from "./shown-document";

const ISSUE_DATE = 1_750_000_000;
const ITEMS = [
  { description: "Beratung", quantity: 1, unit: "h", unitPrice: 10_000, vatRate: 19 },
  { description: "Entwicklung", quantity: 1.5, unit: "h", unitPrice: 8_000, vatRate: 19 },
];
const INVOICE_FORM: InvoiceFormInput = {
  customerId: 1,
  issueDate: ISSUE_DATE,
  deliveryDate: null,
  dueDate: ISSUE_DATE,
  notes: null,
  paymentTerms: null,
  reverseChargeType: "none",
  supplyKind: "services",
  items: ITEMS,
};
const OFFER_FORM: OfferFormInput = {
  customerId: 1,
  issueDate: ISSUE_DATE,
  validUntil: ISSUE_DATE + 86_400,
  notes: null,
  introText: null,
  reverseChargeType: "none",
  supplyKind: "services",
  items: ITEMS,
};

const database = (): SqliteDatabase => sqlite.current!;

/** Every row of every table: whatever a preview wrote anywhere, this differs afterwards. */
function databaseContent(): string {
  const tables = database()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  const content = tables.map(({ name }) => [name, database().prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]);
  return JSON.stringify(content, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

function sentPayload(command = "generate_pdf_preview"): Record<string, any> {
  const call = invoke.mock.calls.find(([name]) => name === command);
  return (call?.[1] as { payload: Record<string, any> }).payload;
}

/** Runs `work` while the database refuses every statement that is not a read, and says which were tried. */
async function withReadOnlyDatabase<T>(work: () => Promise<T>): Promise<{ result: T; refused: string[] }> {
  const refused: string[] = [];
  sqlite.beforeExecute = (query) => {
    refused.push(query);
    throw new Error(`write during a preview: ${query}`);
  };
  try {
    return { result: await work(), refused };
  } finally {
    sqlite.beforeExecute = null;
  }
}

function commandsInvoked(): string[] {
  return invoke.mock.calls.map(([command]) => command);
}

async function issuedInvoice(): Promise<number> {
  const id = await createInvoice(INVOICE_FORM);
  await issueInvoice(id);
  return id;
}

beforeEach(() => {
  sqlite.current = migratedDatabase();
  sqlite.beforeExecute = null;
  invoke.mockClear();
  database().exec("INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH')");
  database().exec("INSERT OR IGNORE INTO settings (id) VALUES (1)");
  database().exec(
    "UPDATE settings SET company_name = 'Muster GmbH', street = 'Hauptstr. 1', postal_code = '10115', city = 'Berlin', tax_number = '12/345/67890', is_kleinunternehmer = 0 WHERE id = 1",
  );
});

describe("previewInvoicePdf", () => {
  const drafts: [string, () => Promise<number>, string | RegExp][] = [
    ["a never-numbered draft", () => createInvoice(INVOICE_FORM), /^Entwurf #[0-9a-f]{4}$/],
    [
      "a reopened draft",
      async () => {
        const id = await issuedInvoice();
        await reopenDraft(id);
        return id;
      },
      /^RE-/,
    ],
    [
      "a credit note draft",
      async () => createCreditNoteFromInvoice(await issuedInvoice()),
      /^Entwurf #[0-9a-f]{4}$/,
    ],
    [
      "a discarded draft",
      async () => {
        const id = await createInvoice(INVOICE_FORM);
        await cancelInvoice(id);
        return id;
      },
      /^Entwurf #[0-9a-f]{4}$/,
    ],
  ];

  it.each(drafts)("changes nothing in the database for %s", async (_name, make) => {
    const id = await make();
    const before = databaseContent();
    invoke.mockClear();

    const { result: response, refused } = await withReadOnlyDatabase(() => previewInvoicePdf(id));

    expect(response).toEqual({ success: true, pdfPath: PREVIEW_PATH });
    expect(refused).toEqual([]);
    expect(databaseContent()).toBe(before);
    expect(commandsInvoked()).toEqual(["generate_pdf_preview"]);
  });

  it.each(drafts)("shows %s with its draft label instead of the placeholder", async (_name, make, expected) => {
    const id = await make();

    await previewInvoicePdf(id);

    expect(sentPayload().invoice.number).toMatch(expected);
    expect(JSON.stringify(sentPayload())).not.toContain("DRAFT-");
  });

  it("keeps a never-numbered draft a draft: placeholder, status, no PDF path, counter untouched", async () => {
    const id = await createInvoice(INVOICE_FORM);
    const counterBefore = database().prepare("SELECT invoice_number_counter FROM settings WHERE id = 1").all();

    await previewInvoicePdf(id);

    const [row] = database().prepare("SELECT number, status, pdf_path FROM invoices WHERE id = ?").all(id) as {
      number: string;
      status: string;
      pdf_path: string | null;
    }[];
    expect(row).toMatchObject({ status: "draft", pdf_path: null });
    expect(row.number).toMatch(/^DRAFT-/);
    expect(database().prepare("SELECT invoice_number_counter FROM settings WHERE id = 1").all()).toEqual(counterBefore);
    expect(database().prepare("SELECT COUNT(*) AS n FROM invoice_seals").all()).toEqual([{ n: 0 }]);
  });

  it("hands the host the document, not a path: the sidecar payload names no output file", async () => {
    const id = await createInvoice(INVOICE_FORM);

    await previewInvoicePdf(id);

    const [, args] = invoke.mock.calls.find(([command]) => command === "generate_pdf_preview")!;
    expect(args).toMatchObject({ kind: "invoice", id });
    expect(sentPayload().outputPath).toBe("");
  });

  it("sends what issuing would produce: the same items, totals and customer", async () => {
    const id = await createInvoice(INVOICE_FORM);

    await previewInvoicePdf(id);

    expect(sentPayload()).toMatchObject({
      invoice: { total: 26_180, isCreditNote: false },
      customer: { name: "Acme GmbH" },
      company: { companyName: "Muster GmbH" },
    });
    expect(sentPayload().items).toHaveLength(2);
  });

  it("reports missing settings instead of creating them", async () => {
    const id = await createInvoice(INVOICE_FORM);
    database().exec("DELETE FROM settings");
    const before = databaseContent();

    const { result, refused } = await withReadOnlyDatabase(() => previewInvoicePdf(id).catch((e: Error) => e));

    expect(result).toEqual(new Error(SETTINGS_MISSING_MESSAGE));
    expect(refused).toEqual([]);
    expect(databaseContent()).toBe(before);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses incomplete company data like issuing does, without calling the sidecar", async () => {
    const id = await createInvoice(INVOICE_FORM);
    database().exec("UPDATE settings SET company_name = '' WHERE id = 1");

    const response = await previewInvoicePdf(id);

    expect(response).toMatchObject({ success: false, error: { code: "company_incomplete" } });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("fails for an unknown invoice", async () => {
    await expect(previewInvoicePdf(99)).rejects.toThrow("Rechnung 99 nicht gefunden.");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("passes the sidecar's error on", async () => {
    const id = await createInvoice(INVOICE_FORM);
    const error = { success: false, error: { code: "RENDER_FAILED", message: "boom", details: "" } };
    invoke.mockResolvedValueOnce(error);

    expect(await previewInvoicePdf(id)).toEqual(error);
  });

  it("is not a no-op check: issuing the same draft does change the database", async () => {
    const id = await createInvoice(INVOICE_FORM);
    const before = databaseContent();

    await generateInvoicePdf(id);

    expect(databaseContent()).not.toBe(before);
    expect(commandsInvoked()).toContain("archive_pdf_version");
  });
});

describe("the customer shown for an invoice", () => {
  const EDITED = "UPDATE customers SET name = 'Acme AG', street = 'Neue Gasse 2', city = 'Hamburg' WHERE id = 1";

  async function snapshotOf(id: number): Promise<string> {
    const [row] = database().prepare("SELECT customer_snapshot FROM invoices WHERE id = ?").all(id) as {
      customer_snapshot: string;
    }[];
    return row.customer_snapshot;
  }

  it("is the current customer for a draft, as issuing would snapshot it, without saving that", async () => {
    const id = await createInvoice(INVOICE_FORM);
    const stored = await snapshotOf(id);
    database().exec(EDITED);

    const { refused } = await withReadOnlyDatabase(() => previewInvoicePdf(id));

    expect(refused).toEqual([]);
    expect(sentPayload().customer).toMatchObject({ name: "Acme AG", street: "Neue Gasse 2", city: "Hamburg" });
    expect(await snapshotOf(id)).toBe(stored);
  });

  it("is the same on the sheet and in the preview", async () => {
    const id = await createInvoice(INVOICE_FORM);
    database().exec(EDITED);

    await renderInvoiceSheet(id);
    await previewInvoicePdf(id);

    expect(sentPayload("render_document_html").customer).toEqual(sentPayload().customer);
    expect(sentPayload("render_document_html").invoice.number).toBe(sentPayload().invoice.number);
  });

  it("is the stored snapshot once the invoice is not a draft any more", async () => {
    const id = await issuedInvoice();
    database().exec(EDITED);

    await previewInvoicePdf(id);

    expect(sentPayload().customer).toMatchObject({ name: "Acme GmbH" });
  });

  it("is the stored snapshot of a discarded draft, which can no longer be issued", async () => {
    const id = await createInvoice(INVOICE_FORM);
    await cancelInvoice(id);
    database().exec(EDITED);

    await previewInvoicePdf(id);

    expect(sentPayload().customer).toMatchObject({ name: "Acme GmbH" });
  });
});

describe("shownInvoiceNumber", () => {
  it("reads the placeholder of a never-numbered draft as its draft label", () => {
    expect(shownInvoiceNumber("DRAFT-0a1b2c3d4e5f6071")).toBe("Entwurf #0a1b");
  });

  it("keeps a real number", () => {
    expect(shownInvoiceNumber("RE-2026-0012")).toBe("RE-2026-0012");
  });

  it("is what the sheet shows for a discarded draft, like the preview", async () => {
    const id = await createInvoice(INVOICE_FORM);
    await cancelInvoice(id);

    await renderInvoiceSheet(id);
    await previewInvoicePdf(id);

    expect(sentPayload("render_document_html").invoice.number).toMatch(/^Entwurf #[0-9a-f]{4}$/);
    expect(sentPayload().invoice.number).toBe(sentPayload("render_document_html").invoice.number);
  });
});

describe("previewOfferPdf", () => {
  it("changes nothing in the database and stores no PDF path, so the amounts stay editable", async () => {
    const id = await createOffer(OFFER_FORM);
    const before = databaseContent();

    const { result: response, refused } = await withReadOnlyDatabase(() => previewOfferPdf(id));

    expect(response).toEqual({ success: true, pdfPath: PREVIEW_PATH });
    expect(refused).toEqual([]);
    expect(databaseContent()).toBe(before);
    expect(database().prepare("SELECT pdf_path FROM offers WHERE id = ?").all(id)).toEqual([{ pdf_path: null }]);
    expect(commandsInvoked()).toEqual(["generate_pdf_preview"]);
  });

  it("sends the offer as an offer", async () => {
    const id = await createOffer(OFFER_FORM);

    await previewOfferPdf(id);

    const [, args] = invoke.mock.calls.find(([command]) => command === "generate_pdf_preview")!;
    expect(args).toMatchObject({ kind: "offer", id });
    expect(sentPayload()).toMatchObject({ offer: { total: 26_180 }, customer: { name: "Acme GmbH" } });
    expect(sentPayload().outputPath).toBe("");
  });

  it("reports missing settings instead of creating them", async () => {
    const id = await createOffer(OFFER_FORM);
    database().exec("DELETE FROM settings");

    const { result, refused } = await withReadOnlyDatabase(() => previewOfferPdf(id).catch((e: Error) => e));

    expect(result).toEqual(new Error(SETTINGS_MISSING_MESSAGE));
    expect(refused).toEqual([]);
  });

  it("refuses incomplete company data without calling the sidecar", async () => {
    const id = await createOffer(OFFER_FORM);
    database().exec("UPDATE settings SET tax_number = '', vat_id = NULL WHERE id = 1");

    expect(await previewOfferPdf(id)).toMatchObject({ success: false, error: { code: "company_incomplete" } });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("fails for an unknown offer", async () => {
    await expect(previewOfferPdf(99)).rejects.toThrow("Angebot 99 nicht gefunden.");
  });

  it("is not a no-op check: the real offer PDF changes the database and stores its path", async () => {
    const id = await createOffer(OFFER_FORM);
    const before = databaseContent();

    await generateOfferPdf(id);

    expect(databaseContent()).not.toBe(before);
    expect(database().prepare("SELECT pdf_path FROM offers WHERE id = ?").all(id)).toEqual([
      { pdf_path: "C:/documents/issued.pdf" },
    ]);
  });
});
