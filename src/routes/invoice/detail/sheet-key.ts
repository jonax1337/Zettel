/** Fields that change on a document without changing what its sheet shows. */
const INVOICE_IGNORED = [
  "notesInternal",
  "followUpDate",
  "lastValidationStatus",
  "lastValidatedAt",
  "lastValidationFindingsCount",
  "pdfPath",
  "updatedAt",
] as const;

const OFFER_IGNORED = ["pdfPath", "updatedAt"] as const;

/** Stable text for a document and its items; equal keys mean the sheet would come out the same. */
function keyOf(record: object, items: object[], ignored: readonly string[]): string {
  const shown = Object.fromEntries(Object.entries(record).filter(([name]) => !ignored.includes(name)));
  return JSON.stringify([shown, items]);
}

export function invoiceSheetKey(invoice: object, items: object[]): string {
  return keyOf(invoice, items, INVOICE_IGNORED);
}

export function offerSheetKey(offer: object, items: object[]): string {
  return keyOf(offer, items, OFFER_IGNORED);
}
