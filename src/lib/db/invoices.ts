import { execute, insert, select, toSqlBool } from "./client";
import {
  buildDocumentFilter,
  datedLineColumns,
  DEFAULT_CURRENCY,
  listYears,
  MISSING_NAME,
  writeLineItems,
} from "./doc-queries";
import {
  mapInvoice,
  mapItem,
  type InvoiceItemRow,
  type InvoiceRow,
} from "./invoice-rows";
import {
  canCancelInvoice,
  canCreateCreditNote,
  canDeleteInvoice,
  canReopenInvoice,
  creditedCentSql,
  isSettledByCreditNote,
  openBalanceCent,
  SETTLED_BY_CREDIT_NOTE_ERROR,
} from "./invoice-lifecycle";
import { recomputeInvoiceStatus } from "./invoice-payments";
import { drawNextNumber } from "./numbering";
import { getCustomer, loadSettings } from "./queries";
import { appendSeal } from "./seals";
import { parseSnapshot } from "./snapshot-json";
import { buildCustomerSnapshot } from "./snapshots";
import type {
  CustomerSnapshot,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  PdfLanguage,
} from "./schema";
import { computeEurTotalCent } from "$lib/utils/currency";
import { nowUnix, toUnix } from "$lib/utils/date";
import { displayInvoiceNumber, draftPlaceholder, isDraftNumber } from "$lib/utils/invoice-number";
import { computeTotals, type Totals } from "$lib/utils/totals";
import { normalizeBuyerReference, resolveBuyerReference } from "$lib/xrechnung/buyer-reference";

export { displayInvoiceNumber, isDraftNumber };

// --- Input types ---

/** No id/invoiceId/lineTotal: those are derived. */
type InvoiceItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number; // cents
  vatRate: number; // percent
  longDescription?: string | null;
  linePeriodStart?: number | null;
  linePeriodEnd?: number | null;
};

export type ReverseChargeType = "none" | "intra_eu" | "third_country";

/** 'goods' = Lieferung, 'services' = sonstige Leistung; decides the UStVA line and the PDF legal notice. */
export type SupplyKind = Invoice["supplyKind"];

export type InvoiceFormInput = {
  customerId: number;
  issueDate: number;
  deliveryDate: number | null;
  dueDate: number;
  notes: string | null;
  paymentTerms: string | null;
  reverseChargeType: ReverseChargeType;
  supplyKind: SupplyKind;
  isCreditNote?: boolean;
  correctsInvoiceId?: number | null;
  items: InvoiceItemInput[];
  currency?: string;
  exchangeRate?: string | null;
  eurTotalCent?: number | null;
  notesInternal?: string | null;
  followUpDate?: number | null;
  servicePeriodStart?: number | null;
  servicePeriodEnd?: number | null;
  skontoPercent?: number | null;
  skontoDays?: number | null;
  pdfLanguage?: PdfLanguage;
  /** BT-10 / Leitweg-ID. Left out, a new invoice takes the customer's; null clears it. */
  buyerReference?: string | null;
  /** Defaults to the current setting; a credit note takes the flag of the invoice it corrects. */
  isKleinunternehmer?: boolean;
};

// --- List / get ---

export type InvoiceFilter = {
  status?: InvoiceStatus | "all";
  year?: number | "all";
  customerId?: number | "all";
  search?: string;
};

/**
 * `creditedCent`: what issued credit notes take off the invoice. `settledByCreditNote`:
 * together with the payments they leave nothing open, so the invoice is no longer due.
 */
export type InvoiceListRow = Invoice & {
  customerName: string;
  creditedCent: number;
  settledByCreditNote: boolean;
};

export function buildInvoiceFilter(filter: InvoiceFilter) {
  const { customerId, ...rest } = filter;
  return buildDocumentFilter("i", "customer_id", ["i.number", "c.name"], {
    ...rest,
    partyId: customerId,
  });
}

export async function listInvoices(
  filter: InvoiceFilter = {},
): Promise<InvoiceListRow[]> {
  const { where, binds } = buildInvoiceFilter(filter);
  const rows = await select<
    InvoiceRow & { customer_name: string | null; credited_cent: number }
  >(
    `SELECT i.*, c.name AS customer_name,
            ${creditedCentSql("i")} AS credited_cent
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     ${where}
     ORDER BY i.issue_date DESC, i.id DESC`,
    binds,
  );
  return rows.map((r) => {
    const invoice = { ...mapInvoice(r), creditedCent: r.credited_cent };
    return {
      ...invoice,
      customerName: r.customer_name ?? MISSING_NAME,
      settledByCreditNote: isSettledByCreditNote(invoice),
    };
  });
}

/** Absolute sum of the issued credit notes correcting the invoice, in its currency. */
export async function loadCreditedCent(invoiceId: number): Promise<number> {
  const [row] = await select<{ credited_cent: number }>(
    `SELECT ${creditedCentSql("i")} AS credited_cent FROM invoices i WHERE i.id = ?`,
    [invoiceId],
  );
  return row?.credited_cent ?? 0;
}

async function findInvoice(id: number): Promise<Invoice | null> {
  const rows = await select<InvoiceRow>("SELECT * FROM invoices WHERE id = ?", [id]);
  return rows.length ? mapInvoice(rows[0]) : null;
}

export async function getInvoice(
  id: number,
): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
  const invoice = await findInvoice(id);
  if (!invoice) return null;
  const itemRows = await select<InvoiceItemRow>(
    "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position ASC",
    [id],
  );
  return { invoice, items: itemRows.map(mapItem) };
}

export const getInvoiceYears = () => listYears("invoices");

// --- Create / update ---

function writeItems(invoiceId: number, items: InvoiceItemInput[]): Promise<void> {
  return writeLineItems("invoice_items", "invoice_id", invoiceId, items, datedLineColumns);
}

/** Credit notes (Stornorechnungen) store all amounts negated. */
function creditNoteSign(isCreditNote: boolean | undefined): 1 | -1 {
  return isCreditNote ? -1 : 1;
}

function computeSignedTotals(
  items: InvoiceItemInput[],
  opts: {
    isKleinunternehmer: boolean;
    reverseChargeType: ReverseChargeType;
    isCreditNote: boolean | undefined;
  },
): Totals {
  const totals = computeTotals(items, {
    isKleinunternehmer: opts.isKleinunternehmer,
    isReverseCharge: opts.reverseChargeType !== "none",
  });
  const sign = creditNoteSign(opts.isCreditNote);
  return {
    subtotal: totals.subtotal * sign,
    vatAmount: totals.vatAmount * sign,
    total: totals.total * sign,
  };
}

function signedOrNull(amount: number | null | undefined, sign: 1 | -1): number | null {
  return amount != null ? amount * sign : null;
}

/** For optional form fields: undefined keeps the stored value, null clears it. */
export function orKeep<T>(incoming: T | undefined, current: T): T {
  return incoming === undefined ? current : incoming;
}

/**
 * Foreign-currency invoices need a frozen EUR total for KPIs, UStVA and DATEV.
 * Callers that do not pass one (offer conversion, recurring, credit notes) get
 * it derived from the invoice's own total and exchange rate.
 */
function eurTotalFor(input: InvoiceFormInput, unsignedTotal: number): number | null {
  if (input.eurTotalCent !== undefined) return input.eurTotalCent;
  const currency = input.currency ?? DEFAULT_CURRENCY;
  if (currency === DEFAULT_CURRENCY) return null;
  return computeEurTotalCent(currency, unsignedTotal, input.exchangeRate);
}

/** A credit note is denominated in its original's currency, whatever the caller passes. */
async function withCorrectedCurrency(input: InvoiceFormInput): Promise<InvoiceFormInput> {
  if (!input.isCreditNote || input.correctsInvoiceId == null) return input;
  const original = await findInvoice(input.correctsInvoiceId);
  if (!original) throw new Error(`Rechnung ${input.correctsInvoiceId} nicht gefunden.`);
  return { ...input, currency: original.currency, exchangeRate: original.exchangeRate };
}

export async function createInvoice(formInput: InvoiceFormInput): Promise<number> {
  const input = await withCorrectedCurrency(formInput);
  const settings = await loadSettings();
  const snapshot = await buildCustomerSnapshot(input.customerId);
  const customer = input.buyerReference === undefined ? await getCustomer(input.customerId) : null;
  const isCreditNote = !!input.isCreditNote;
  const isKleinunternehmer = input.isKleinunternehmer ?? settings.isKleinunternehmer;
  const sign = creditNoteSign(isCreditNote);
  const totals = computeSignedTotals(input.items, {
    isKleinunternehmer,
    reverseChargeType: input.reverseChargeType,
    isCreditNote,
  });

  const id = await insert(
    `INSERT INTO invoices
      (number, customer_id, customer_snapshot, issue_date, delivery_date, due_date,
       status, subtotal, vat_amount, total, is_kleinunternehmer, is_reverse_charge,
       reverse_charge_type, supply_kind, notes, payment_terms, is_credit_note, corrects_invoice_id,
       currency, exchange_rate, eur_total_cent, notes_internal, follow_up_date,
       service_period_start, service_period_end, skonto_percent, skonto_days, pdf_language, buyer_reference)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      draftPlaceholder(),
      input.customerId,
      JSON.stringify(snapshot),
      input.issueDate,
      input.deliveryDate,
      input.dueDate,
      totals.subtotal,
      totals.vatAmount,
      totals.total,
      toSqlBool(isKleinunternehmer),
      toSqlBool(input.reverseChargeType !== "none"),
      input.reverseChargeType,
      input.supplyKind,
      input.notes,
      input.paymentTerms,
      toSqlBool(isCreditNote),
      input.correctsInvoiceId ?? null,
      input.currency ?? DEFAULT_CURRENCY,
      input.exchangeRate ?? null,
      signedOrNull(eurTotalFor(input, Math.abs(totals.total)), sign),
      input.notesInternal ?? null,
      input.followUpDate ?? null,
      input.servicePeriodStart ?? null,
      input.servicePeriodEnd ?? null,
      isCreditNote ? null : input.skontoPercent ?? null,
      isCreditNote ? null : input.skontoDays ?? null,
      input.pdfLanguage ?? settings.defaultPdfLanguage,
      resolveBuyerReference(input.buyerReference, customer?.leitwegId ?? null),
    ],
  );
  await writeItems(id, input.items);
  return id;
}

export async function updateInvoice(
  id: number,
  input: InvoiceFormInput,
): Promise<void> {
  const current = await findInvoice(id);
  if (!current) throw new Error(`Invoice ${id} not found`);
  if (current.status !== "draft") {
    throw new Error("Nur Entwürfe können bearbeitet werden.");
  }
  const sign = creditNoteSign(current.isCreditNote);
  const currency = current.isCreditNote ? current.currency : input.currency ?? current.currency;
  const exchangeRate = current.isCreditNote ? current.exchangeRate : orKeep(input.exchangeRate, current.exchangeRate);
  const totals = computeSignedTotals(input.items, {
    isKleinunternehmer: current.isKleinunternehmer,
    reverseChargeType: input.reverseChargeType,
    isCreditNote: current.isCreditNote,
  });
  // Drafts follow the customer's master data until they are issued.
  const customerSnapshot = JSON.stringify(await buildCustomerSnapshot(input.customerId));

  await execute(
    `UPDATE invoices SET
      customer_id = ?, customer_snapshot = ?,
      issue_date = ?, delivery_date = ?, due_date = ?,
      subtotal = ?, vat_amount = ?, total = ?,
      is_reverse_charge = ?, reverse_charge_type = ?, supply_kind = ?,
      notes = ?, payment_terms = ?,
      currency = ?, exchange_rate = ?, eur_total_cent = ?,
      notes_internal = ?, follow_up_date = ?,
      service_period_start = ?, service_period_end = ?,
      skonto_percent = ?, skonto_days = ?,
      pdf_language = ?, buyer_reference = ?,
      updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.customerId,
      customerSnapshot,
      input.issueDate,
      input.deliveryDate,
      input.dueDate,
      totals.subtotal,
      totals.vatAmount,
      totals.total,
      toSqlBool(input.reverseChargeType !== "none"),
      input.reverseChargeType,
      input.supplyKind,
      input.notes,
      input.paymentTerms,
      currency,
      exchangeRate,
      input.eurTotalCent === undefined
        ? current.eurTotalCent
        : signedOrNull(input.eurTotalCent, sign),
      orKeep(input.notesInternal, current.notesInternal),
      orKeep(input.followUpDate, current.followUpDate),
      input.servicePeriodStart ?? null,
      input.servicePeriodEnd ?? null,
      current.isCreditNote ? null : input.skontoPercent ?? null,
      current.isCreditNote ? null : input.skontoDays ?? null,
      input.pdfLanguage ?? current.pdfLanguage,
      normalizeBuyerReference(orKeep(input.buyerReference, current.buyerReference)),
      id,
    ],
  );
  await writeItems(id, input.items);
}

export async function updateInvoiceInternalMeta(
  id: number,
  patch: { notesInternal?: string | null; followUpDate?: number | null },
): Promise<void> {
  await execute(
    `UPDATE invoices SET notes_internal = ?, follow_up_date = ?, updated_at = unixepoch() WHERE id = ?`,
    [patch.notesInternal ?? null, patch.followUpDate ?? null, id],
  );
}

export type ValidationOutcome = NonNullable<Invoice["lastValidationStatus"]>;

const VALIDATION_ASSIGNMENTS =
  "last_validation_status = ?, last_validated_at = unixepoch(), last_validation_findings_count = ?";

export async function recordInvoiceValidation(
  id: number,
  outcome: ValidationOutcome,
  findingsCount: number | null,
): Promise<void> {
  await execute(`UPDATE invoices SET ${VALIDATION_ASSIGNMENTS} WHERE id = ?`, [
    outcome,
    findingsCount,
    id,
  ]);
}

/** Stores a freshly rendered PDF together with the outcome of its validation. */
export async function recordGeneratedPdf(
  id: number,
  pdfPath: string,
  outcome: ValidationOutcome,
  findingsCount: number | null,
): Promise<void> {
  await execute(
    `UPDATE invoices SET pdf_path = ?, ${VALIDATION_ASSIGNMENTS}, updated_at = unixepoch() WHERE id = ?`,
    [pdfPath, outcome, findingsCount, id],
  );
}

export async function deleteInvoice(id: number): Promise<void> {
  const invoice = await findInvoice(id);
  if (!invoice) return;
  if (!canDeleteInvoice(invoice)) {
    throw new Error(
      "Nur Entwürfe ohne Rechnungsnummer können gelöscht werden. Ausgestellte Rechnungen bitte per Stornorechnung korrigieren.",
    );
  }
  // invoice_payments has no FK to invoices, so they would be left behind.
  await execute("DELETE FROM invoice_payments WHERE invoice_id = ?", [id]);
  await execute("DELETE FROM invoices WHERE id = ?", [id]);
}

// --- Credit notes ---

/** The credit note correcting this invoice; a discarded (cancelled) draft does not count. */
export async function findCreditNoteFor(invoiceId: number): Promise<Invoice | null> {
  const rows = await select<InvoiceRow>(
    "SELECT * FROM invoices WHERE corrects_invoice_id = ? AND status != 'cancelled' ORDER BY id ASC LIMIT 1",
    [invoiceId],
  );
  return rows.length ? mapInvoice(rows[0]) : null;
}

/**
 * Items are mirrored verbatim; the user can edit quantities in the draft to model
 * partial refunds. The foreign-currency terms of the original carry over, because
 * the mirrored unit prices are denominated in that currency; the EUR total is
 * derived from the credit note's own total. The Kleinunternehmer treatment is the
 * original's, not today's setting.
 */
export function creditNoteInputFor(
  invoice: Invoice,
  items: InvoiceItem[],
  issueDate: number,
): InvoiceFormInput {
  return {
    customerId: invoice.customerId,
    issueDate,
    deliveryDate: invoice.deliveryDate,
    dueDate: issueDate,
    notes: `Storno zur Rechnung ${invoice.number}`,
    paymentTerms: null,
    reverseChargeType: invoice.reverseChargeType,
    supplyKind: invoice.supplyKind,
    isCreditNote: true,
    correctsInvoiceId: invoice.id,
    servicePeriodStart: invoice.servicePeriodStart,
    servicePeriodEnd: invoice.servicePeriodEnd,
    currency: invoice.currency,
    exchangeRate: invoice.exchangeRate,
    isKleinunternehmer: invoice.isKleinunternehmer,
    buyerReference: invoice.buyerReference,
    items: items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      vatRate: it.vatRate,
      longDescription: it.longDescription,
      linePeriodStart: it.linePeriodStart,
      linePeriodEnd: it.linePeriodEnd,
    })),
  };
}

function assertCancellable(invoice: Invoice): void {
  if (invoice.isCreditNote) {
    throw new Error("Für eine Stornorechnung kann keine weitere Stornorechnung erstellt werden.");
  }
  if (!canCreateCreditNote(invoice)) {
    throw new Error("Nur versendete, teilbezahlte oder bezahlte Rechnungen können storniert werden.");
  }
}

/** Creates a draft credit note (Stornorechnung) from a sent, partially paid or paid invoice. */
export async function createCreditNoteFromInvoice(originalId: number): Promise<number> {
  const original = await getInvoice(originalId);
  if (!original) throw new Error(`Rechnung ${originalId} nicht gefunden.`);
  assertCancellable(original.invoice);
  const existing = await findCreditNoteFor(originalId);
  if (existing) {
    throw new Error(`Es existiert bereits eine Stornorechnung (${existing.number}).`);
  }
  return createInvoice(creditNoteInputFor(original.invoice, original.items, nowUnix()));
}

// --- Status transitions ---

/**
 * Assigns the final invoice number (if still a DRAFT-… placeholder) and
 * transitions status draft → sent. The counter is only consumed here, never on
 * createInvoice, so deleted or abandoned drafts leave no gaps.
 *
 * sentAt defaults to now; pass the original send date (unix seconds) when
 * recording an old invoice after the fact.
 *
 * The draft → sent transition is claimed with a conditional UPDATE before a
 * number is drawn, so a double click can neither issue twice nor burn a number.
 */
export async function issueInvoice(
  id: number,
  sentAt?: number,
): Promise<string> {
  const invoice = await findInvoice(id);
  if (!invoice) throw new Error(`Rechnung ${id} nicht gefunden.`);
  if (invoice.status !== "draft") return invoice.number;

  const snapshot = JSON.stringify(await buildCustomerSnapshot(invoice.customerId));
  const claim = await execute(
    `UPDATE invoices SET status = 'sent', sent_at = ?, customer_snapshot = ?, updated_at = unixepoch()
     WHERE id = ? AND status = 'draft'`,
    [sentAt ?? nowUnix(), snapshot, id],
  );
  if (claim.rowsAffected !== 1) return numberIssuedConcurrently(id);
  const number = isDraftNumber(invoice.number) ? await assignFinalNumber(invoice) : invoice.number;
  await sealIssuedInvoice(id);
  await recomputeCorrectedInvoice(invoice);
  return number;
}

/** The invoice is already issued; a failed seal must not undo that, the startup backfill seals it later. */
async function sealIssuedInvoice(id: number): Promise<void> {
  try {
    await appendSeal(id, "issue");
  } catch (error) {
    console.error(`Versiegeln der Rechnung ${id} fehlgeschlagen, wird beim nächsten Start nachgeholt`, error);
  }
}

/** An issued credit note changes what its original still owes, so the original's status is derived again. */
async function recomputeCorrectedInvoice(creditNote: Invoice): Promise<void> {
  if (creditNote.isCreditNote && creditNote.correctsInvoiceId !== null) {
    await recomputeInvoiceStatus(creditNote.correctsInvoiceId);
  }
}

async function numberIssuedConcurrently(id: number): Promise<string> {
  const current = await findInvoice(id);
  if (!current || isDraftNumber(current.number)) {
    throw new Error("Die Rechnung wird gerade ausgestellt. Bitte gleich noch einmal versuchen.");
  }
  return current.number;
}

/** Runs after the claim; on failure the invoice goes back to draft so it can be issued again. */
async function assignFinalNumber(invoice: Invoice): Promise<string> {
  try {
    const number = await drawNextNumber("invoice", invoice.issueDate);
    await execute("UPDATE invoices SET number = ? WHERE id = ?", [number, invoice.id]);
    return number;
  } catch (error) {
    await execute(
      "UPDATE invoices SET status = 'draft', sent_at = NULL, updated_at = unixepoch() WHERE id = ?",
      [invoice.id],
    );
    throw error;
  }
}

export { issueInvoice as markSent };

async function sumPayments(invoiceId: number): Promise<number> {
  const [row] = await select<{ paid_cent: number }>(
    "SELECT COALESCE(SUM(amount_cent), 0) AS paid_cent FROM invoice_payments WHERE invoice_id = ?",
    [invoiceId],
  );
  return row?.paid_cent ?? 0;
}

/**
 * Pays off the remaining balance, i.e. what payments and issued credit notes
 * leave open. The remainder is logged as a payment so the payment list stays
 * consistent with a direct "fully paid" action; an overpayment stays visible in
 * amount_paid_cent.
 */
export async function markPaid(id: number, paidAt?: number): Promise<void> {
  const before = await findInvoice(id);
  if (!before) return;
  if (before.status === "draft") {
    await issueInvoice(id, paidAt);
  }
  const invoice = await findInvoice(id);
  if (!invoice) return;
  if (invoice.status !== "sent" && invoice.status !== "partial") return;

  const paidBefore = await sumPayments(id);
  const settlement = {
    total: invoice.total,
    amountPaidCent: paidBefore,
    creditedCent: await loadCreditedCent(id),
  };
  if (isSettledByCreditNote(settlement)) throw new Error(SETTLED_BY_CREDIT_NOTE_ERROR);

  const paymentTimestamp = paidAt ?? nowUnix();
  const remaining = openBalanceCent(settlement);
  if (remaining > 0) {
    await execute(
      `INSERT INTO invoice_payments (invoice_id, paid_at, amount_cent, source)
       VALUES (?, ?, ?, 'auto')`,
      [id, paymentTimestamp, remaining],
    );
  }
  await execute(
    `UPDATE invoices SET status = 'paid', paid_at = ?, amount_paid_cent = ?, updated_at = unixepoch()
     WHERE id = ? AND status IN ('sent','partial')`,
    [paymentTimestamp, paidBefore + Math.max(remaining, 0), id],
  );
}

/** Discards an unnumbered draft. Issued invoices are corrected with a credit note instead. */
export async function cancelInvoice(id: number): Promise<void> {
  const invoice = await findInvoice(id);
  if (!invoice) throw new Error(`Rechnung ${id} nicht gefunden.`);
  if (!canCancelInvoice(invoice)) {
    throw new Error(
      "Nur Entwürfe ohne Rechnungsnummer können verworfen werden. Ausgestellte Rechnungen bitte per Stornorechnung stornieren.",
    );
  }
  await execute(
    "UPDATE invoices SET status = 'cancelled', updated_at = unixepoch() WHERE id = ? AND status = 'draft'",
    [id],
  );
}

async function countPayments(invoiceId: number): Promise<number> {
  const [row] = await select<{ c: number }>(
    "SELECT COUNT(*) AS c FROM invoice_payments WHERE invoice_id = ?",
    [invoiceId],
  );
  return row?.c ?? 0;
}

/** Sends an issued invoice back to draft; it keeps its number. */
export async function reopenDraft(id: number): Promise<void> {
  const invoice = await findInvoice(id);
  if (!invoice) throw new Error(`Rechnung ${id} nicht gefunden.`);
  const facts = {
    paymentCount: await countPayments(id),
    hasCreditNote: (await findCreditNoteFor(id)) !== null,
  };
  if (!canReopenInvoice(invoice, facts)) {
    throw new Error(
      "Nur versendete Rechnungen ohne Zahlungen und ohne Stornorechnung können wieder bearbeitet werden.",
    );
  }
  // Seal first: should the status change then fail, an issued invoice behind a
  // reopen seal only counts as unsealed and is sealed again at the next start.
  await appendSeal(id, "reopen");
  await execute(
    "UPDATE invoices SET status = 'draft', sent_at = NULL, paid_at = NULL, updated_at = unixepoch() WHERE id = ? AND status = ?",
    [id, invoice.status],
  );
  await recomputeCorrectedInvoice(invoice);
}

// --- Export ---

export type InvoiceForExport = {
  invoice: Invoice;
  items: InvoiceItem[];
  customerName: string;
  customerVatId: string | null;
};

const EXPORTABLE_INVOICES_IN_RANGE =
  "status IN ('sent','partial','paid') AND issue_date >= ? AND issue_date <= ?";

function readSnapshotCustomer(
  snapshotJson: string,
): Pick<InvoiceForExport, "customerName" | "customerVatId"> {
  const snapshot = parseSnapshot<CustomerSnapshot>(snapshotJson, "Kundensnapshot (Export)");
  return {
    customerName: snapshot.name ?? MISSING_NAME,
    customerVatId: snapshot.vatId ?? null,
  };
}

function groupItemsByInvoice(rows: InvoiceItemRow[]): Map<number, InvoiceItem[]> {
  const byInvoice = new Map<number, InvoiceItem[]>();
  for (const row of rows) {
    const items = byInvoice.get(row.invoice_id) ?? [];
    items.push(mapItem(row));
    byInvoice.set(row.invoice_id, items);
  }
  return byInvoice;
}

export async function loadInvoicesForExport(
  dateFromUnix: number,
  dateToUnix: number,
): Promise<InvoiceForExport[]> {
  const range = [dateFromUnix, dateToUnix];
  const invoiceRows = await select<InvoiceRow>(
    `SELECT * FROM invoices
     WHERE ${EXPORTABLE_INVOICES_IN_RANGE}
     ORDER BY issue_date ASC, id ASC`,
    range,
  );
  if (!invoiceRows.length) return [];

  const itemRows = await select<InvoiceItemRow>(
    `SELECT * FROM invoice_items
     WHERE invoice_id IN (SELECT id FROM invoices WHERE ${EXPORTABLE_INVOICES_IN_RANGE})
     ORDER BY invoice_id, position`,
    range,
  );
  const itemsByInvoice = groupItemsByInvoice(itemRows);

  return invoiceRows.map((row) => ({
    invoice: mapInvoice(row),
    items: itemsByInvoice.get(row.id) ?? [],
    ...readSnapshotCustomer(row.customer_snapshot),
  }));
}
