import { execute, select } from "./client";
import { SETTINGS_DEFAULTS } from "./queries";
import { formatInvoiceNumber } from "$lib/utils/invoice-number";

const SEQUENCES = {
  invoice: {
    counter: "invoice_number_counter",
    format: "invoice_number_format",
    defaultFormat: "invoiceNumberFormat",
  },
  offer: {
    counter: "offer_number_counter",
    format: "offer_number_format",
    defaultFormat: "offerNumberFormat",
  },
  expense: {
    counter: "expense_number_counter",
    format: "expense_number_format",
    defaultFormat: "expenseNumberFormat",
  },
  reminder: {
    counter: "reminder_number_counter",
    format: "reminder_number_format",
    defaultFormat: "reminderNumberFormat",
  },
} as const;

export type NumberSequence = keyof typeof SEQUENCES;

/**
 * Bumps the sequence's counter in the settings row and formats the new number.
 * Year and month placeholders come from the document date (unix seconds), not from today.
 * Single-writer SQLite keeps this safe.
 */
export async function drawNextNumber(
  sequence: NumberSequence,
  documentDate: number,
): Promise<string> {
  const { counter, format, defaultFormat } = SEQUENCES[sequence];
  await execute(
    `UPDATE settings SET ${counter} = ${counter} + 1, updated_at = unixepoch() WHERE id = 1`,
  );
  const [row] = await select<{ counter: number | null; format: string | null }>(
    `SELECT ${counter} AS counter, ${format} AS format FROM settings WHERE id = 1`,
  );
  return formatInvoiceNumber(
    row?.format ?? SETTINGS_DEFAULTS[defaultFormat],
    row?.counter ?? 1,
    new Date(documentDate * 1000),
  );
}
