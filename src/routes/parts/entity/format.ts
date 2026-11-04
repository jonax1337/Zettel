import { eurStringToCents } from "$lib/utils/money";

/** Euro amount as the editable text of a price input ("1234,50"); parsed back by `eurStringToCents`. */
export function centsToPriceText(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Parses the price input text into `unitPrice` and rewrites the text in canonical form. */
export function commitPriceText(row: { priceText: string; unitPrice: number }): void {
  row.unitPrice = eurStringToCents(row.priceText);
  row.priceText = centsToPriceText(row.unitPrice);
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
