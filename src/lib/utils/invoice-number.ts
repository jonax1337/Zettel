/**
 * Format an invoice number from a pattern like "RE-{YYYY}-{NNNN}".
 * Supported placeholders: {YYYY}, {YY}, {MM}, {NNNN}, {NNN}, {NN}, {N}.
 */
export function formatInvoiceNumber(
  pattern: string,
  counter: number,
  date: Date = new Date(),
): string {
  const yyyy = String(date.getFullYear());
  const yy = yyyy.slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return pattern
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{MM\}/g, mm)
    .replace(/\{NNNN\}/g, String(counter).padStart(4, "0"))
    .replace(/\{NNN\}/g, String(counter).padStart(3, "0"))
    .replace(/\{NN\}/g, String(counter).padStart(2, "0"))
    .replace(/\{N\}/g, String(counter));
}
