/**
 * GoBD hash chain over issued invoices (#143). Every issue and reopen appends a
 * seal whose hash covers the previous seal and a hash of the invoice content.
 * cli/zettel.py computes the same hashes; `invoice-seal.json` pins the format.
 *
 * Rows are read straight from SQL, not through the camelCase mappers, so both
 * implementations hash the raw stored values.
 */
import { insert, select } from "./client";
import { nowUnix } from "$lib/utils/date";

export const GENESIS_HASH = "0".repeat(64);

const SEAL_DOCUMENT_TAG = "zettel-invoice-seal";
const SEAL_FORMAT_VERSION = 1;
const MAX_APPEND_ATTEMPTS = 3;
const ISSUED_STATUSES = ["sent", "partial", "paid"];
const ISSUED_STATUSES_SQL = "('sent','partial','paid')";

// Not sealed: status, sent_at, paid_at, amount_paid_cent, pdf_path, last_validation_*,
// notes_internal, follow_up_date and the timestamps change legitimately after issue.
const SEALED_INVOICE_COLUMNS = [
  "number", "customer_id", "customer_snapshot", "issue_date", "delivery_date", "due_date",
  "subtotal", "vat_amount", "total", "is_kleinunternehmer", "is_reverse_charge",
  "reverse_charge_type", "supply_kind", "notes", "payment_terms", "is_credit_note",
  "corrects_invoice_id", "currency", "exchange_rate", "eur_total_cent", "service_period_start",
  "service_period_end", "skonto_percent", "skonto_days", "pdf_language", "buyer_reference",
] as const;

const SEALED_ITEM_COLUMNS = [
  "position", "description", "quantity", "unit", "unit_price", "vat_rate", "line_total",
  "long_description", "line_period_start", "line_period_end",
] as const;

export type SealKind = "issue" | "reopen";

type SealRow = {
  id: number;
  invoice_id: number;
  kind: SealKind;
  sealed_at: number;
  content_hash: string;
  prev_hash: string;
  hash: string;
};

type SealedRow = Record<string, unknown>;

export type SealedContent = { invoice: SealedRow; items: SealedRow[] };

export type IntegrityProblemKind =
  | "chain_broken"
  | "seal_tampered"
  | "content_changed"
  | "invoice_deleted"
  | "reopened_without_seal"
  | "unsealed";

export type IntegrityProblem = {
  kind: IntegrityProblemKind;
  severity: "error" | "warning";
  invoiceId: number;
  invoiceNumber: string | null;
  sealId: number | null;
};

/** `sealedInvoiceCount`: invoices that have at least one seal. */
export type IntegrityReport = {
  checkedAt: number;
  sealCount: number;
  sealedInvoiceCount: number;
  problems: IntegrityProblem[];
};

export type InvoiceSealStatus = {
  state: "sealed" | "changed" | "unsealed" | "draft";
  sealedAt: number | null;
  hash: string | null;
};

// --- Hashing ---

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A REAL with an integral value (1.0) is read back as the integer 1, which JSON.stringify prints as such. */
function valuesOf(row: SealedRow, columns: readonly string[]): unknown[] {
  return columns.map((column) => row[column] ?? null);
}

export function canonicalSealDocument({ invoice, items }: SealedContent): string {
  return JSON.stringify([
    SEAL_DOCUMENT_TAG,
    SEAL_FORMAT_VERSION,
    valuesOf(invoice, SEALED_INVOICE_COLUMNS),
    items.map((item) => valuesOf(item, SEALED_ITEM_COLUMNS)),
  ]);
}

export function contentHashOf(content: SealedContent): Promise<string> {
  return sha256Hex(canonicalSealDocument(content));
}

export function chainHashOf(
  prevHash: string,
  invoiceId: number,
  kind: SealKind,
  sealedAt: number,
  contentHash: string,
): Promise<string> {
  return sha256Hex(`${prevHash}|${invoiceId}|${kind}|${sealedAt}|${contentHash}`);
}

// --- Reading ---

async function loadSealedContent(invoiceId: number): Promise<SealedContent | null> {
  const [invoice] = await select<SealedRow>(
    `SELECT ${SEALED_INVOICE_COLUMNS.join(", ")} FROM invoices WHERE id = ?`,
    [invoiceId],
  );
  if (!invoice) return null;
  const items = await select<SealedRow>(
    `SELECT ${SEALED_ITEM_COLUMNS.join(", ")} FROM invoice_items WHERE invoice_id = ? ORDER BY position, id`,
    [invoiceId],
  );
  return { invoice, items };
}

async function currentContentHash(invoiceId: number): Promise<string | null> {
  const content = await loadSealedContent(invoiceId);
  return content && contentHashOf(content);
}

async function latestSealOf(invoiceId: number): Promise<SealRow | null> {
  const [seal] = await select<SealRow>(
    "SELECT * FROM invoice_seals WHERE invoice_id = ? ORDER BY id DESC LIMIT 1",
    [invoiceId],
  );
  return seal ?? null;
}

// --- Appending ---

function isUniqueViolation(error: unknown): boolean {
  return String(error).includes("UNIQUE constraint failed");
}

async function appendSealOnce(invoiceId: number, kind: SealKind): Promise<void> {
  const contentHash = await currentContentHash(invoiceId);
  if (contentHash === null) throw new Error(`Rechnung ${invoiceId} nicht gefunden.`);
  const [last] = await select<{ hash: string }>("SELECT hash FROM invoice_seals ORDER BY id DESC LIMIT 1");
  const prevHash = last?.hash ?? GENESIS_HASH;
  const sealedAt = nowUnix();
  const hash = await chainHashOf(prevHash, invoiceId, kind, sealedAt, contentHash);
  await insert(
    `INSERT INTO invoice_seals (invoice_id, kind, sealed_at, content_hash, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [invoiceId, kind, sealedAt, contentHash, prevHash, hash],
  );
}

/** Seals the invoice's current content. A seal appended concurrently makes prev_hash collide: read the chain again. */
export async function appendSeal(invoiceId: number, kind: SealKind): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await appendSealOnce(invoiceId, kind);
      return;
    } catch (error) {
      if (attempt >= MAX_APPEND_ATTEMPTS || !isUniqueViolation(error)) throw error;
    }
  }
}

/**
 * Seals every issued invoice whose latest seal is missing or a reopen, e.g. one
 * issued by an older app version or whose seal failed. Returns how many were sealed.
 */
export async function sealPendingInvoices(): Promise<number> {
  const pending = await select<{ id: number }>(
    `SELECT i.id FROM invoices i
     WHERE i.status IN ${ISSUED_STATUSES_SQL}
       AND COALESCE(
             (SELECT s.kind FROM invoice_seals s WHERE s.invoice_id = i.id ORDER BY s.id DESC LIMIT 1),
             'reopen') = 'reopen'
     ORDER BY i.sent_at, i.id`,
  );
  for (const { id } of pending) await appendSeal(id, "issue");
  return pending.length;
}

// --- Verification ---

type InvoiceHead = { id: number; number: string; status: string };

function problem(
  kind: IntegrityProblemKind,
  invoiceId: number,
  invoiceNumber: string | null,
  sealId: number | null,
): IntegrityProblem {
  return { kind, severity: kind === "unsealed" ? "warning" : "error", invoiceId, invoiceNumber, sealId };
}

async function chainProblems(seals: SealRow[], numbers: Map<number, string>): Promise<IntegrityProblem[]> {
  const problems: IntegrityProblem[] = [];
  let expectedPrev = GENESIS_HASH;
  for (const seal of seals) {
    const number = numbers.get(seal.invoice_id) ?? null;
    if (seal.prev_hash !== expectedPrev) problems.push(problem("chain_broken", seal.invoice_id, number, seal.id));
    const recomputed = await chainHashOf(seal.prev_hash, seal.invoice_id, seal.kind, seal.sealed_at, seal.content_hash);
    if (recomputed !== seal.hash) problems.push(problem("seal_tampered", seal.invoice_id, number, seal.id));
    expectedPrev = seal.hash;
  }
  return problems;
}

async function latestSealProblem(seal: SealRow, invoice: InvoiceHead | undefined): Promise<IntegrityProblem | null> {
  if (seal.kind !== "issue") {
    return invoice && ISSUED_STATUSES.includes(invoice.status)
      ? problem("unsealed", invoice.id, invoice.number, null)
      : null;
  }
  if (!invoice) return problem("invoice_deleted", seal.invoice_id, null, seal.id);
  if (!ISSUED_STATUSES.includes(invoice.status)) {
    return problem("reopened_without_seal", invoice.id, invoice.number, seal.id);
  }
  const currentHash = await currentContentHash(invoice.id);
  return currentHash === seal.content_hash ? null : problem("content_changed", invoice.id, invoice.number, seal.id);
}

/** Walks the whole chain and compares every issued invoice with its latest seal. */
export async function verifyInvoiceChain(): Promise<IntegrityReport> {
  const seals = await select<SealRow>("SELECT * FROM invoice_seals ORDER BY id");
  const invoices = await select<InvoiceHead>("SELECT id, number, status FROM invoices");
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const latestByInvoice = new Map(seals.map((seal) => [seal.invoice_id, seal]));

  const problems = await chainProblems(seals, new Map(invoices.map((invoice) => [invoice.id, invoice.number])));
  for (const seal of latestByInvoice.values()) {
    const found = await latestSealProblem(seal, byId.get(seal.invoice_id));
    if (found) problems.push(found);
  }
  for (const invoice of invoices) {
    if (ISSUED_STATUSES.includes(invoice.status) && !latestByInvoice.has(invoice.id)) {
      problems.push(problem("unsealed", invoice.id, invoice.number, null));
    }
  }
  return { checkedAt: nowUnix(), sealCount: seals.length, sealedInvoiceCount: latestByInvoice.size, problems };
}

export async function checkInvoiceSeal(invoiceId: number): Promise<InvoiceSealStatus> {
  const [invoice] = await select<InvoiceHead>("SELECT id, number, status FROM invoices WHERE id = ?", [invoiceId]);
  if (!invoice) throw new Error(`Rechnung ${invoiceId} nicht gefunden.`);
  if (!ISSUED_STATUSES.includes(invoice.status)) return { state: "draft", sealedAt: null, hash: null };

  const seal = await latestSealOf(invoiceId);
  if (!seal || seal.kind !== "issue") return { state: "unsealed", sealedAt: null, hash: null };
  const unchanged = (await currentContentHash(invoiceId)) === seal.content_hash;
  return { state: unchanged ? "sealed" : "changed", sealedAt: seal.sealed_at, hash: seal.hash };
}
