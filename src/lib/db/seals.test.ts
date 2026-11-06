import { beforeEach, describe, expect, it, vi } from "vitest";
import fixtureJson from "../../../sidecar/tests/fixtures/invoice-seal.json?raw";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { addPayment } from "./invoice-payments";
import {
  createInvoice,
  issueInvoice,
  markPaid,
  recordGeneratedPdf,
  reopenDraft,
  updateInvoiceInternalMeta,
} from "./invoices";
import type { InvoiceFormInput } from "./invoices";
import {
  appendSeal,
  canonicalSealDocument,
  chainHashOf,
  checkInvoiceSeal,
  contentHashOf,
  GENESIS_HASH,
  sealPendingInvoices,
  verifyInvoiceChain,
  type IntegrityProblemKind,
  type SealKind,
} from "./seals";

type SealedContent = Parameters<typeof canonicalSealDocument>[0];
type SealRow = {
  id: number;
  invoice_id: number;
  kind: SealKind;
  sealed_at: number;
  content_hash: string;
  prev_hash: string;
  hash: string;
};

const fixture = JSON.parse(fixtureJson) as {
  documents: (SealedContent & { name: string; canonical: string; contentHash: string })[];
  chain: { invoiceId: number; kind: SealKind; sealedAt: number; document: string; prevHash: string; hash: string }[];
  numbers: { value: number; js: string }[];
};

const ISSUE_DATE = 1_750_000_000;

const FORM: InvoiceFormInput = {
  customerId: 1,
  issueDate: ISSUE_DATE,
  deliveryDate: null,
  dueDate: ISSUE_DATE,
  notes: null,
  paymentTerms: null,
  reverseChargeType: "none",
  supplyKind: "services",
  items: [
    { description: "Beratung", quantity: 1, unit: "h", unitPrice: 10_000, vatRate: 19 },
    { description: "Entwicklung", quantity: 1.5, unit: "h", unitPrice: 8_000, vatRate: 19 },
  ],
};

const database = (): SqliteDatabase => sqlite.current!;

function rows<T>(query: string, ...bindings: (string | number)[]): T[] {
  return database().prepare(query).all(...bindings) as T[];
}

function seals(): SealRow[] {
  return rows<SealRow>("SELECT * FROM invoice_seals ORDER BY id");
}

async function issuedInvoice(): Promise<number> {
  const id = await createInvoice(FORM);
  await issueInvoice(id);
  return id;
}

async function problemKinds(): Promise<IntegrityProblemKind[]> {
  return (await verifyInvoiceChain()).problems.map((p) => p.kind).sort();
}

beforeEach(() => {
  sqlite.current = migratedDatabase();
  sqlite.beforeExecute = null;
  database().exec("INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH')");
});

describe("the seal format shared with cli/zettel.py", () => {
  it.each(fixture.documents.map((d) => [d.name, d] as const))("canonical document and content hash: %s", async (_, doc) => {
    expect(canonicalSealDocument(doc)).toBe(doc.canonical);
    expect(await contentHashOf(doc)).toBe(doc.contentHash);
  });

  it("links the seals of the fixture chain", async () => {
    for (const link of fixture.chain) {
      const doc = fixture.documents.find((d) => d.name === link.document)!;
      expect(await chainHashOf(link.prevHash, link.invoiceId, link.kind, link.sealedAt, doc.contentHash)).toBe(link.hash);
    }
    expect(fixture.chain[0].prevHash).toBe(GENESIS_HASH);
    expect(fixture.chain[1].prevHash).toBe(fixture.chain[0].hash);
  });

  it.each(fixture.numbers.map((n) => [n.js, n] as const))("renders the number %s", (_, { value, js }) => {
    expect(JSON.stringify(value)).toBe(js);
  });
});

describe("issuing and reopening", () => {
  it("seals an issued invoice as the first link of the chain", async () => {
    const id = await issuedInvoice();

    const [seal] = seals();

    expect(seals()).toHaveLength(1);
    expect(seal).toMatchObject({ invoice_id: id, kind: "issue", prev_hash: GENESIS_HASH });
    expect(await checkInvoiceSeal(id)).toEqual({ state: "sealed", sealedAt: seal.sealed_at, hash: seal.hash });
  });

  it("does not seal a draft", async () => {
    const id = await createInvoice(FORM);

    expect(seals()).toEqual([]);
    expect(await checkInvoiceSeal(id)).toEqual({ state: "draft", sealedAt: null, hash: null });
  });

  it("appends a reopen seal, then a new issue seal when the invoice is issued again", async () => {
    const id = await issuedInvoice();

    await reopenDraft(id);
    await issueInvoice(id);

    expect(seals().map((s) => s.kind)).toEqual(["issue", "reopen", "issue"]);
    expect(seals()[1].prev_hash).toBe(seals()[0].hash);
    expect(seals()[2].prev_hash).toBe(seals()[1].hash);
    expect((await verifyInvoiceChain()).problems).toEqual([]);
  });

  it("reports a reopened invoice as a draft", async () => {
    const id = await issuedInvoice();

    await reopenDraft(id);

    expect(await checkInvoiceSeal(id)).toEqual({ state: "draft", sealedAt: null, hash: null });
    expect((await verifyInvoiceChain()).problems).toEqual([]);
  });

  it("chains the seals of several invoices", async () => {
    await issuedInvoice();
    await issuedInvoice();

    const [first, second] = seals();

    expect(second.prev_hash).toBe(first.hash);
    expect(await verifyInvoiceChain()).toMatchObject({ sealCount: 2, sealedInvoiceCount: 2, problems: [] });
  });

  it("keeps the invoice issued when sealing fails, and the startup backfill seals it later", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await createInvoice(FORM);
    sqlite.beforeExecute = (query) => {
      if (query.includes("INSERT INTO invoice_seals")) throw new Error("disk full");
    };

    await issueInvoice(id);
    sqlite.beforeExecute = null;

    expect(rows<{ status: string }>("SELECT status FROM invoices WHERE id = ?", id)[0].status).toBe("sent");
    expect(seals()).toEqual([]);
    expect(await sealPendingInvoices()).toBe(1);
    expect(await checkInvoiceSeal(id)).toMatchObject({ state: "sealed" });
  });
});

describe("appending when another seal is appended concurrently", () => {
  function competingSealOnEveryAppend() {
    let competitors = 0;
    sqlite.beforeExecute = (query) => {
      if (!query.includes("INSERT INTO invoice_seals")) return;
      const [last] = rows<{ hash: string }>("SELECT hash FROM invoice_seals ORDER BY id DESC LIMIT 1");
      competitors += 1;
      database()
        .prepare("INSERT INTO invoice_seals (invoice_id, kind, sealed_at, content_hash, prev_hash, hash) VALUES (99, 'issue', 1, 'c', ?, ?)")
        .run(last?.hash ?? GENESIS_HASH, `competitor-${competitors}`);
    };
  }

  it("reads the chain again and appends behind the competitor", async () => {
    const id = await createInvoice(FORM);
    let competed = false;
    sqlite.beforeExecute = (query) => {
      if (competed || !query.includes("INSERT INTO invoice_seals")) return;
      competed = true;
      database()
        .prepare("INSERT INTO invoice_seals (invoice_id, kind, sealed_at, content_hash, prev_hash, hash) VALUES (99, 'issue', 1, 'c', ?, 'competitor')")
        .run(GENESIS_HASH);
    };

    await appendSeal(id, "issue");

    expect(seals().map((s) => [s.invoice_id, s.prev_hash])).toEqual([
      [99, GENESIS_HASH],
      [id, "competitor"],
    ]);
  });

  it("gives up after three attempts", async () => {
    const id = await createInvoice(FORM);
    competingSealOnEveryAppend();

    await expect(appendSeal(id, "issue")).rejects.toThrow("UNIQUE constraint failed");
    expect(seals()).toHaveLength(3);
  });
});

describe("verifying an issued invoice", () => {
  it.each([
    ["the total", "UPDATE invoices SET total = total + 1"],
    ["the customer snapshot", "UPDATE invoices SET customer_snapshot = '{\"name\":\"Mallory\"}'"],
    ["the number", "UPDATE invoices SET number = 'RE-1999-0001'"],
    ["an item description", "UPDATE invoice_items SET description = 'Manipuliert' WHERE position = 1"],
    ["an item quantity", "UPDATE invoice_items SET quantity = 2 WHERE position = 2"],
    ["an added item", "INSERT INTO invoice_items (invoice_id, position, description) VALUES (1, 3, 'Extra')"],
    ["a removed item", "DELETE FROM invoice_items WHERE position = 2"],
  ])("reports %s as changed", async (_, tamper) => {
    const id = await issuedInvoice();

    database().exec(tamper);

    expect((await verifyInvoiceChain()).problems).toEqual([
      { kind: "content_changed", severity: "error", invoiceId: id, invoiceNumber: expect.any(String), sealId: 1 },
    ]);
    expect(await checkInvoiceSeal(id)).toMatchObject({ state: "changed" });
  });

  it("is not affected by what legitimately changes after issue", async () => {
    const id = await issuedInvoice();

    await addPayment({ invoiceId: id, paidAt: ISSUE_DATE, amountCent: 5_000 });
    await recordGeneratedPdf(id, "C:/Rechnungen/RE.pdf", "valid", 0);
    await updateInvoiceInternalMeta(id, { notesInternal: "Rückruf", followUpDate: ISSUE_DATE });
    await markPaid(id, ISSUE_DATE);

    expect(rows<{ status: string }>("SELECT status FROM invoices WHERE id = ?", id)[0].status).toBe("paid");
    expect((await verifyInvoiceChain()).problems).toEqual([]);
    expect(await checkInvoiceSeal(id)).toMatchObject({ state: "sealed" });
  });

  it("reports a deleted invoice", async () => {
    const id = await issuedInvoice();

    database().exec("DELETE FROM invoice_items; DELETE FROM invoices");

    expect((await verifyInvoiceChain()).problems).toEqual([
      { kind: "invoice_deleted", severity: "error", invoiceId: id, invoiceNumber: null, sealId: 1 },
    ]);
  });

  it("reports an invoice put back to draft without a reopen seal", async () => {
    const id = await issuedInvoice();

    database().exec("UPDATE invoices SET status = 'draft'");

    expect((await verifyInvoiceChain()).problems).toEqual([
      { kind: "reopened_without_seal", severity: "error", invoiceId: id, invoiceNumber: expect.any(String), sealId: 1 },
    ]);
  });
});

describe("verifying the chain itself", () => {
  async function chainOfTwo() {
    await issuedInvoice();
    await issuedInvoice();
  }

  it("reports a seal whose content hash was edited as tampered", async () => {
    await chainOfTwo();
    database().exec("DROP TRIGGER invoice_seals_no_update; UPDATE invoice_seals SET content_hash = 'edited' WHERE id = 1");

    expect(await problemKinds()).toEqual(["content_changed", "seal_tampered"]);
  });

  it("reports an edited hash as tampered and the broken link behind it", async () => {
    await chainOfTwo();
    database().exec("DROP TRIGGER invoice_seals_no_update; UPDATE invoice_seals SET hash = 'forged' WHERE id = 1");

    const { problems } = await verifyInvoiceChain();

    expect(problems.filter((p) => p.kind !== "content_changed").map((p) => [p.kind, p.sealId])).toEqual([
      ["seal_tampered", 1],
      ["chain_broken", 2],
    ]);
  });

  it("reports a removed seal in the middle of the chain", async () => {
    await chainOfTwo();
    await issuedInvoice();
    database().exec("DROP TRIGGER invoice_seals_no_delete; DELETE FROM invoice_seals WHERE id = 2");

    const { problems } = await verifyInvoiceChain();

    expect(problems.map((p) => [p.kind, p.sealId, p.severity])).toEqual(
      expect.arrayContaining([["chain_broken", 3, "error"]]),
    );
    expect(problems.some((p) => p.kind === "unsealed" && p.invoiceId === 2)).toBe(true);
  });

  it("reports seals removed from the end of the chain", async () => {
    await chainOfTwo();
    database().exec("DROP TRIGGER invoice_seals_no_delete; DELETE FROM invoice_seals WHERE id = 2");

    const { problems } = await verifyInvoiceChain();

    expect(problems).toContainEqual({ kind: "chain_truncated", severity: "error", invoiceId: 0, invoiceNumber: null, sealId: null });
    expect(await problemKinds()).toEqual(["chain_truncated", "unsealed"]);
  });

  it("reports a chain emptied completely", async () => {
    await chainOfTwo();
    database().exec("DROP TRIGGER invoice_seals_no_delete; DELETE FROM invoice_seals");

    expect(await problemKinds()).toEqual(["chain_truncated", "unsealed", "unsealed"]);
  });

  it("does not report a chain that never had a seal", async () => {
    expect(await problemKinds()).toEqual([]);
  });

  it("reports a seal that does not start at the genesis hash", async () => {
    await chainOfTwo();
    database().exec("DROP TRIGGER invoice_seals_no_delete; DELETE FROM invoice_seals WHERE id = 1");

    expect((await problemKinds()).filter((kind) => kind === "chain_broken")).toEqual(["chain_broken"]);
  });
});

describe("verifying many invoices", () => {
  const INVOICE_COUNT = 300;

  function insertSentInvoices(count: number, firstNumber: number) {
    const insertInvoice = database().prepare(
      `INSERT INTO invoices (number, customer_id, customer_snapshot, issue_date, due_date, status, sent_at)
       VALUES (?, 1, '{}', ?, ?, 'sent', ?)`,
    );
    const insertItem = database().prepare("INSERT INTO invoice_items (invoice_id, position, description) VALUES (?, ?, ?)");
    database().exec("BEGIN");
    for (let n = firstNumber; n < firstNumber + count; n++) {
      const id = Number(insertInvoice.run(`RE-2026-${n}`, ISSUE_DATE, ISSUE_DATE, ISSUE_DATE + n).lastInsertRowid);
      insertItem.run(id, 1, "Beratung");
      insertItem.run(id, 2, "Entwicklung");
    }
    database().exec("COMMIT");
  }

  async function selectsDuringVerification(): Promise<number> {
    const prepare = vi.spyOn(database(), "prepare");
    await verifyInvoiceChain();
    const selects = prepare.mock.calls.filter(([query]) => String(query).trimStart().startsWith("SELECT")).length;
    prepare.mockRestore();
    return selects;
  }

  it("issues the same few queries however many invoices there are, and still finds a tampered one", async () => {
    insertSentInvoices(2, 1);
    await sealPendingInvoices();
    const selectsForTwo = await selectsDuringVerification();

    insertSentInvoices(INVOICE_COUNT, 3);
    await sealPendingInvoices();
    database().exec("UPDATE invoice_items SET description = 'Manipuliert' WHERE invoice_id = 150 AND position = 2");

    expect(await selectsDuringVerification()).toBe(selectsForTwo);
    expect(selectsForTwo).toBeLessThanOrEqual(4);
    expect(await verifyInvoiceChain()).toMatchObject({
      sealCount: INVOICE_COUNT + 2,
      problems: [{ kind: "content_changed", invoiceId: 150, invoiceNumber: "RE-2026-150" }],
    });
  });
});

describe("appending several seals at once", () => {
  it("appends one after the other, so the app never collides with itself", async () => {
    const ids = [await createInvoice(FORM), await createInvoice(FORM), await createInvoice(FORM)];

    await Promise.all(ids.map((id) => appendSeal(id, "issue")));

    const appended = seals();
    expect(appended.map((s) => s.invoice_id)).toEqual(ids);
    expect(appended.map((s) => s.prev_hash)).toEqual([GENESIS_HASH, appended[0].hash, appended[1].hash]);
  });

  it("goes on with the next append when one fails", async () => {
    const id = await createInvoice(FORM);

    const results = await Promise.allSettled([appendSeal(9999, "issue"), appendSeal(id, "issue")]);

    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
    expect(seals().map((s) => s.invoice_id)).toEqual([id]);
  });
});

describe("issued invoices without a seal", () => {
  let bypassed = 0;
  beforeEach(() => {
    bypassed = 0;
  });

  function issueBypassingTheApp(sentAt = ISSUE_DATE): number {
    bypassed += 1;
    const result = database()
      .prepare(
        `INSERT INTO invoices (number, customer_id, customer_snapshot, issue_date, due_date, status, sent_at)
         VALUES (?, 1, '{}', ?, ?, 'sent', ?)`,
      )
      .run(`RE-2026-000${bypassed}`, ISSUE_DATE, ISSUE_DATE, sentAt);
    return Number(result.lastInsertRowid);
  }

  it("is a warning, not an error", async () => {
    const id = issueBypassingTheApp();

    expect((await verifyInvoiceChain()).problems).toEqual([
      { kind: "unsealed", severity: "warning", invoiceId: id, invoiceNumber: "RE-2026-0001", sealId: null },
    ]);
    expect(await checkInvoiceSeal(id)).toEqual({ state: "unsealed", sealedAt: null, hash: null });
  });

  it("is sealed by the startup backfill, once", async () => {
    const id = issueBypassingTheApp();

    expect(await sealPendingInvoices()).toBe(1);
    expect(await sealPendingInvoices()).toBe(0);

    expect(seals().map((s) => [s.invoice_id, s.kind])).toEqual([[id, "issue"]]);
    expect((await verifyInvoiceChain()).problems).toEqual([]);
  });

  it("covers an invoice whose latest seal is a reopen", async () => {
    const id = await issuedInvoice();
    await reopenDraft(id);
    database().exec("UPDATE invoices SET status = 'sent'");

    expect(await problemKinds()).toEqual(["unsealed"]);
    expect(await sealPendingInvoices()).toBe(1);
    expect(seals().map((s) => s.kind)).toEqual(["issue", "reopen", "issue"]);
  });

  it("seals the backlog in the order the invoices were sent", async () => {
    const later = issueBypassingTheApp(ISSUE_DATE + 100);
    const earlier = issueBypassingTheApp(ISSUE_DATE);

    await sealPendingInvoices();

    expect(seals().map((s) => s.invoice_id)).toEqual([earlier, later]);
  });

  it("leaves drafts and cancelled invoices alone", async () => {
    await createInvoice(FORM);
    const cancelled = await createInvoice(FORM);
    database().prepare("UPDATE invoices SET status = 'cancelled' WHERE id = ?").run(cancelled);

    expect(await sealPendingInvoices()).toBe(0);
    expect((await verifyInvoiceChain()).problems).toEqual([]);
  });
});
