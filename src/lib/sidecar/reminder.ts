import { getInvoice } from "$lib/db/invoices";
import { loadSettings } from "$lib/db/queries";
import { getReminder, levelLabel } from "$lib/db/reminders";
import type {
  CustomerSnapshot,
  Invoice,
  Reminder,
  ReminderInvoiceSnapshot,
  ReminderLevel,
  Settings,
} from "$lib/db/schema";
import { parseSnapshot } from "$lib/db/snapshot-json";
import {
  companyBankPayload,
  companyContactPayload,
  documentOutputPath,
  pdfSettingsPayload,
} from "./payload";
import { renderDocumentPdf, storePdfPath } from "./render-document";
import type { SidecarResponse } from "./types";

const FALLBACK_CUSTOMER_NAME = "—";
const FALLBACK_CUSTOMER_COUNTRY = "DE";

/** Reconstructs the snapshot from the live invoice when the stored one is unreadable. */
function snapshotFromInvoice(invoice: Invoice): ReminderInvoiceSnapshot {
  const customer = parseSnapshot<CustomerSnapshot>(
    invoice.customerSnapshot,
    `Kundensnapshot ${invoice.number}`,
  );
  return {
    invoiceNumber: invoice.number,
    invoiceIssueDate: invoice.issueDate,
    invoiceDueDate: invoice.dueDate,
    customerName: customer.name ?? FALLBACK_CUSTOMER_NAME,
    customerStreet: customer.street ?? "",
    customerPostalCode: customer.postalCode ?? "",
    customerCity: customer.city ?? "",
    customerCountry: customer.country ?? FALLBACK_CUSTOMER_COUNTRY,
    customerContactPerson: customer.contactPerson ?? null,
  };
}

function storedSnapshotOrRebuilt(reminder: Reminder, invoice: Invoice): ReminderInvoiceSnapshot {
  const stored = parseSnapshot<ReminderInvoiceSnapshot>(
    reminder.invoiceSnapshot,
    `Mahnungssnapshot ${reminder.number}`,
  );
  return stored.invoiceNumber ? (stored as ReminderInvoiceSnapshot) : snapshotFromInvoice(invoice);
}

export function buildReminderPayload(opts: {
  reminder: Reminder;
  invoice: Invoice;
  snapshot: ReminderInvoiceSnapshot;
  company: Settings;
  outputPath: string;
}) {
  const { reminder, invoice, snapshot, company, outputPath } = opts;
  return {
    reminder: {
      number: reminder.number,
      level: reminder.level,
      levelLabel: levelLabel(reminder.level as ReminderLevel),
      issueDate: reminder.issueDate,
      dueDate: reminder.dueDate,
      feeCents: reminder.feeCents,
      interestCents: reminder.interestCents,
      originalTotalCents: reminder.originalTotalCents,
      totalDueCents: reminder.totalDueCents,
      bodyText: reminder.bodyText,
    },
    invoice: {
      invoiceNumber: snapshot.invoiceNumber,
      invoiceIssueDate: snapshot.invoiceIssueDate,
      invoiceDueDate: snapshot.invoiceDueDate,
      currency: invoice.currency ?? "EUR",
    },
    customer: {
      name: snapshot.customerName,
      contactPerson: snapshot.customerContactPerson,
      street: snapshot.customerStreet,
      postalCode: snapshot.customerPostalCode,
      city: snapshot.customerCity,
      country: snapshot.customerCountry,
    },
    company: {
      ...companyContactPayload(company),
      ...companyBankPayload(company),
    },
    outputPath,
    settings: pdfSettingsPayload(company),
  };
}

export async function generateReminderPdf(reminderId: number): Promise<SidecarResponse> {
  const reminder = await getReminder(reminderId);
  if (!reminder) throw new Error(`Mahnung ${reminderId} nicht gefunden.`);

  const invoiceData = await getInvoice(reminder.invoiceId);
  if (!invoiceData) {
    throw new Error("Zugehörige Rechnung ist nicht mehr verfügbar.");
  }
  const company = await loadSettings();

  const payload = buildReminderPayload({
    reminder,
    invoice: invoiceData.invoice,
    snapshot: storedSnapshotOrRebuilt(reminder, invoiceData.invoice),
    company,
    outputPath: await documentOutputPath("Mahnungen", reminder.number),
  });

  return renderDocumentPdf("generate_reminder", payload, storePdfPath("reminders", reminderId));
}
