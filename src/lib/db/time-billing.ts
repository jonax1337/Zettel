import { execute, select } from "./client";
import { fullyReversedSql } from "./invoice-lifecycle";
import { createInvoice, deleteInvoice, type InvoiceFormInput } from "./invoices";
import { loadSettings } from "./queries";
import { getTimeEntriesByIds, type TimeEntryListRow } from "./time-entries";
import { previewBilling, type BillingOptions, type BillingPreview } from "$lib/time/billing";
import { toBillableEntry } from "$lib/time/summary";
import { addDaysUnix, startOfDayUnix } from "$lib/utils/date";
import { defaultPaymentTermsText } from "$lib/utils/payment-terms";
import { vatRateForNewItem } from "$lib/utils/vat";
import { skontoFormFromSettings, skontoInput } from "$lib/utils/skonto-form";

/** What the user chooses in the billing dialog; the VAT rate follows the settings. */
export type TimeBillingOptions = Pick<BillingOptions, "grouping" | "incrementMinutes">;

const ALREADY_BILLED = "Einige Einträge wurden inzwischen abgerechnet.";

/** Loads the entries and refuses a selection that cannot become one invoice. */
async function loadBillableSelection(entryIds: number[]): Promise<TimeEntryListRow[]> {
  const ids = [...new Set(entryIds)];
  if (ids.length === 0) throw new Error("Bitte mindestens einen Eintrag zum Abrechnen auswählen.");
  const rows = await getTimeEntriesByIds(ids);
  if (rows.length !== ids.length) throw new Error("Einige Einträge existieren nicht mehr.");
  if (rows.some((r) => r.durationMinutes === null)) {
    throw new Error("Ein laufender Timer kann nicht abgerechnet werden. Bitte zuerst stoppen.");
  }
  if (rows.some((r) => r.invoiceId !== null)) throw new Error(ALREADY_BILLED);
  if (new Set(rows.map((r) => r.customerId)).size > 1) {
    throw new Error("Eine Rechnung kann nur Einträge eines Kunden enthalten. Bitte die Auswahl auf einen Kunden beschränken.");
  }
  return rows;
}

async function planBilling(entryIds: number[], options: TimeBillingOptions) {
  const rows = await loadBillableSelection(entryIds);
  const settings = await loadSettings();
  const preview = previewBilling(
    rows.flatMap((row) => toBillableEntry(row) ?? []),
    { ...options, vatRate: vatRateForNewItem(settings.isKleinunternehmer) },
  );
  return { rows, settings, preview };
}

/** The same positions `billTimeEntries` would create, for the dialog's preview. */
export async function previewTimeBilling(entryIds: number[], options: TimeBillingOptions): Promise<BillingPreview> {
  return (await planBilling(entryIds, options)).preview;
}

/**
 * Creates an invoice draft from open time entries and marks them as billed.
 * Returns the draft's id.
 *
 * The draft is created first and the entries are claimed afterwards with one
 * conditional UPDATE, so an entry billed by someone else in between is never
 * taken twice. If the claim falls short, the draft is deleted again, which also
 * frees the entries it did claim.
 */
export async function billTimeEntries(entryIds: number[], options: TimeBillingOptions): Promise<number> {
  const { rows, settings, preview } = await planBilling(entryIds, options);
  const ids = rows.map((row) => row.id);

  const issueDate = startOfDayUnix(new Date());
  const input: InvoiceFormInput = {
    customerId: rows[0].customerId,
    issueDate,
    deliveryDate: null,
    dueDate: addDaysUnix(issueDate, settings.defaultPaymentTermsDays),
    notes: null,
    paymentTerms: defaultPaymentTermsText(settings.defaultPaymentTermsDays),
    reverseChargeType: "none",
    supplyKind: "services",
    servicePeriodStart: preview.servicePeriodStart,
    servicePeriodEnd: preview.servicePeriodEnd,
    ...skontoInput(skontoFormFromSettings(settings)),
    items: preview.lines,
  };
  const invoiceId = await createInvoice(input);

  try {
    const claim = await execute(
      `UPDATE time_entries SET invoice_id = ?, updated_at = unixepoch()
       WHERE id IN (${ids.map(() => "?").join(", ")})
         AND invoice_id IS NULL AND duration_minutes IS NOT NULL`,
      [invoiceId, ...ids],
    );
    if (claim.rowsAffected !== ids.length) throw new Error(ALREADY_BILLED);
  } catch (error) {
    await deleteInvoice(invoiceId);
    throw error;
  }
  return invoiceId;
}

const NOT_FULLY_REVERSED = "Die Rechnung ist nicht vollständig storniert.";
const NO_BILLED_TIME = "Keine abgerechneten Zeiten an dieser Rechnung.";

/** The entries billed on the invoice bound to the `?`, provided it is fully reversed by credit notes. */
const RELEASABLE_ENTRIES = `invoice_id IN (SELECT i.id FROM invoices i WHERE i.id = ? AND ${fullyReversedSql("i")})`;

export async function countReleasableTimeEntries(invoiceId: number): Promise<number> {
  const [{ count }] = await select<{ count: number }>(
    `SELECT COUNT(*) AS count FROM time_entries WHERE ${RELEASABLE_ENTRIES}`,
    [invoiceId],
  );
  return count;
}

/**
 * Frees the time entries of an invoice that credit notes reverse in full, so they can be
 * billed again. A partial credit note keeps them locked: the rest of the invoice still stands.
 * Returns the number of entries freed.
 *
 * `audit_log` is written by triggers, but `time_entries` is not audited by them, so one row
 * per entry is appended here in the shape of a trigger's update row (parent: the invoice).
 * The log row goes first: a failure then leaves a log entry for an unchanged entry rather
 * than a freed entry nobody logged.
 */
export async function releaseTimeEntriesOfReversedInvoice(invoiceId: number): Promise<number> {
  const logged = await execute(
    `INSERT INTO audit_log (table_name, row_id, parent_id, action, old_values, new_values)
     SELECT 'time_entries', id, invoice_id, 'update',
            json_object('invoice_id', invoice_id), json_object('invoice_id', NULL)
     FROM time_entries WHERE ${RELEASABLE_ENTRIES} ORDER BY id`,
    [invoiceId],
  );
  if (logged.rowsAffected === 0) await throwWhyNotReleasable(invoiceId);

  const freed = await execute(
    `UPDATE time_entries SET invoice_id = NULL, updated_at = unixepoch() WHERE ${RELEASABLE_ENTRIES}`,
    [invoiceId],
  );
  return freed.rowsAffected;
}

async function throwWhyNotReleasable(invoiceId: number): Promise<never> {
  const [{ count }] = await select<{ count: number }>(
    "SELECT COUNT(*) AS count FROM time_entries WHERE invoice_id = ?",
    [invoiceId],
  );
  throw new Error(count === 0 ? NO_BILLED_TIME : NOT_FULLY_REVERSED);
}
