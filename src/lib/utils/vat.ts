export const STANDARD_VAT_RATE = 19;

export const VAT_RATE_ITEMS = [
  { value: "0", label: "0 %" },
  { value: "7", label: "7 %" },
  { value: "19", label: "19 %" },
];

export function vatRateForNewItem(vatExempt: boolean): number {
  return vatExempt ? 0 : STANDARD_VAT_RATE;
}
