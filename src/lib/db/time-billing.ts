import { execute } from "./client";
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
