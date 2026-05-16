import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { execute } from "$lib/db/client";
import { getReminder } from "$lib/db/reminders";
import { getInvoice } from "$lib/db/invoices";
import { loadSettings } from "$lib/db/queries";
import { levelLabel } from "$lib/db/reminders";
import type {
  CustomerSnapshot,
  Reminder,
  ReminderInvoiceSnapshot,
  ReminderLevel,
} from "$lib/db/schema";
import type { SidecarResponse } from "./invoice";

function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_");
}

async function buildOutputPath(number: string): Promise<string> {
  const home = await homeDir();
  return join(home, "Documents", "Zettel", "Mahnungen", `${safeFilename(number)}.pdf`);
}

export async function generateReminderPdf(reminderId: number): Promise<SidecarResponse> {
  const reminder = await getReminder(reminderId);
  if (!reminder) throw new Error(`Mahnung ${reminderId} nicht gefunden.`);

  const invoiceData = await getInvoice(reminder.invoiceId);
  if (!invoiceData) {
    throw new Error("Zugehörige Rechnung ist nicht mehr verfügbar.");
  }
  const company = await loadSettings();

  let snapshot: ReminderInvoiceSnapshot;
  try {
    snapshot = JSON.parse(reminder.invoiceSnapshot);
  } catch {
    let customerSnap: CustomerSnapshot | null = null;
    try {
      customerSnap = JSON.parse(invoiceData.invoice.customerSnapshot);
    } catch {
      customerSnap = null;
    }
    snapshot = {
      invoiceNumber: invoiceData.invoice.number,
      invoiceIssueDate: invoiceData.invoice.issueDate,
      invoiceDueDate: invoiceData.invoice.dueDate,
      customerName: customerSnap?.name ?? "—",
      customerStreet: customerSnap?.street ?? "",
      customerPostalCode: customerSnap?.postalCode ?? "",
      customerCity: customerSnap?.city ?? "",
      customerCountry: customerSnap?.country ?? "DE",
      customerContactPerson: customerSnap?.contactPerson ?? null,
    };
  }

  const outputPath = await buildOutputPath(reminder.number);

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
      companyName: company.companyName,
      ownerName: company.ownerName,
      street: company.street,
      postalCode: company.postalCode,
      city: company.city,
      country: company.country,
      taxNumber: company.taxNumber,
      vatId: company.vatId,
      email: company.email,
      phone: company.phone,
      website: company.website,
      bankName: company.bankName,
      bankIban: company.bankIban,
      bankBic: company.bankBic,
      logoPath: company.logoPath,
    },
    outputPath,
    settings: {
      pdf_theme: company.pdfTheme ?? "classic",
    },
  };

  const response = (await invoke<SidecarResponse>("generate_reminder", { payload })) as SidecarResponse;

  if (response.success) {
    await execute(
      "UPDATE reminders SET pdf_path = ?, updated_at = unixepoch() WHERE id = ?",
      [response.pdfPath, reminderId],
    );
  }
  return response;
}

export type { Reminder };
