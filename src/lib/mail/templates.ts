import type { Settings } from "$lib/db/schema";
import { formatMoney } from "$lib/utils/currency";
import { formatDate } from "$lib/utils/date";

export type MailDocumentType = "invoice" | "offer" | "reminder";

export type MailTemplate = { subject: string; body: string };

export type MailContext = {
  number: string;
  totalCent: number;
  currency: string;
  /** Due date of an invoice or reminder, end of validity of an offer; unix seconds. */
  dueDate: number | null;
  company: string;
  customer: string;
};

export type MailSettings = Pick<
  Settings,
  | "mailInvoiceSubject"
  | "mailInvoiceBody"
  | "mailOfferSubject"
  | "mailOfferBody"
  | "mailReminderSubject"
  | "mailReminderBody"
>;

/** The settings fields that hold a user-edited template; NULL means the built-in default. */
export const MAIL_SETTINGS_KEYS = {
  invoice: { subject: "mailInvoiceSubject", body: "mailInvoiceBody" },
  offer: { subject: "mailOfferSubject", body: "mailOfferBody" },
  reminder: { subject: "mailReminderSubject", body: "mailReminderBody" },
} as const satisfies Record<MailDocumentType, { subject: keyof MailSettings; body: keyof MailSettings }>;

const CLOSING = "Mit freundlichen Grüßen\n{firma}";

export const DEFAULT_MAIL_TEMPLATES: Record<MailDocumentType, MailTemplate> = {
  invoice: {
    subject: "Rechnung {nummer}",
    body: `Guten Tag,\n\nanbei erhalten Sie die Rechnung {nummer} über {betrag}.\nBitte überweisen Sie den Betrag bis zum {faellig}.\n\n${CLOSING}`,
  },
  offer: {
    subject: "Angebot {nummer}",
    body: `Guten Tag,\n\nvielen Dank für Ihr Interesse. Anbei erhalten Sie unser Angebot {nummer} über {betrag}.\nDas Angebot ist gültig bis zum {faellig}.\n\n${CLOSING}`,
  },
  reminder: {
    subject: "Zahlungserinnerung zur Rechnung {nummer}",
    body: `Guten Tag,\n\nzu unserer Rechnung {nummer} konnten wir noch keinen Zahlungseingang feststellen. Anbei erhalten Sie die Mahnung über {betrag}.\nBitte begleichen Sie den Betrag bis zum {faellig}.\n\n${CLOSING}`,
  },
};

export const MAIL_PLACEHOLDERS = [
  { token: "{nummer}", description: "Dokumentnummer" },
  { token: "{betrag}", description: "Gesamtbetrag mit Währung" },
  { token: "{faellig}", description: "Fälligkeit bzw. Gültigkeit" },
  { token: "{firma}", description: "Ihr Firmenname" },
  { token: "{kunde}", description: "Name des Kunden" },
] as const;

const PLACEHOLDER_PATTERN = /\{(nummer|betrag|faellig|firma|kunde)\}/g;

function placeholderValues(ctx: MailContext): Record<string, string> {
  return {
    nummer: ctx.number,
    betrag: formatMoney(ctx.totalCent, ctx.currency),
    faellig: ctx.dueDate === null ? "" : formatDate(ctx.dueDate),
    firma: ctx.company,
    kunde: ctx.customer,
  };
}

/** Replaces the known placeholders in one pass; unknown ones stay as typed. */
export function fillMailPlaceholders(text: string, ctx: MailContext): string {
  const values = placeholderValues(ctx);
  return text.replace(PLACEHOLDER_PATTERN, (_, name: string) => values[name]);
}

function orDefault(custom: string | null, fallback: string): string {
  return custom?.trim() ? custom : fallback;
}

/** The user's template for the document type, falling back to the default per field. */
export function mailTemplateFor(type: MailDocumentType, settings: MailSettings): MailTemplate {
  const keys = MAIL_SETTINGS_KEYS[type];
  const defaults = DEFAULT_MAIL_TEMPLATES[type];
  return {
    subject: orDefault(settings[keys.subject], defaults.subject),
    body: orDefault(settings[keys.body], defaults.body),
  };
}

export function composeMailText(
  type: MailDocumentType,
  settings: MailSettings,
  ctx: MailContext,
): MailTemplate {
  const template = mailTemplateFor(type, settings);
  return {
    subject: fillMailPlaceholders(template.subject, ctx),
    body: fillMailPlaceholders(template.body, ctx),
  };
}
