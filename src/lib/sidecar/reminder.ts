import { invoke } from "@tauri-apps/api/core";
import { execute } from "$lib/db/client";
import { getInvoice } from "$lib/db/invoices";
import { loadSettings } from "$lib/db/queries";
import { getReminder, levelLabel } from "$lib/db/reminders";
import type {
  CustomerSnapshot,
  Invoice,
  ReminderInvoiceSnapshot,
  ReminderLevel,
} from "$lib/db/schema";
import {
  companyBankPayload,
  companyContactPayload,
  documentOutputPath,
  pdfSettingsPayload,
} from "./payload";
import type { SidecarResponse } from "./types";

const FALLBACK_CUSTOMER_NAME = "—";
const FALLBACK_CUSTOMER_COUNTRY = "DE";

function parseJsonOrNull<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Reconstructs the snapshot from the live invoice when the stored one is unreadable. */
function snapshotFromInvoice(invoice: Invoice): ReminderInvoiceSnapshot {
  const customer = parseJsonOrNull<CustomerSnapshot>(invoice.customerSnapshot);
  return {
    invoiceNumber: invoice.number,
    invoiceIssueDate: invoice.issueDate,
    invoiceDueDate: invoice.dueDate,
    customerName: customer?.name ?? FALLBACK_CUSTOMER_NAME,
    customerStreet: customer?.street ?? "",
    customerPostalCode: customer?.postalCode ?? "",
    customerCity: customer?.city ?? "",
    customerCountry: customer?.country ?? FALLBACK_CUSTOMER_COUNTRY,
    customerContactPerson: customer?.contactPerson ?? null,
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

  const snapshot =
    parseJsonOrNull<ReminderInvoiceSnapshot>(reminder.invoiceSnapshot) ??
    snapshotFromInvoice(invoiceData.invoice);

  const outputPath = await documentOutputPath("Mahnungen", reminder.number);

  const payload = {
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

  const response = await invoke<SidecarResponse>("generate_reminder", { payload });

  if (response.success) {
    await execute(
      "UPDATE reminders SET pdf_path = ?, updated_at = unixepoch() WHERE id = ?",
      [response.pdfPath, reminderId],
    );
  }
  return response;
}
