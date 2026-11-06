export function normalizeBuyerReference(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/**
 * The invoice form's field tracks the selected customer's Leitweg-ID until the user
 * edits it: a value that still equals the previously followed default is replaced.
 */
export function followCustomerLeitweg(current: string, previousFollowed: string, nextFollowed: string): string {
  return current === previousFollowed ? nextFollowed : current;
}

/**
 * BT-10 of a new invoice: an explicit value, even an emptied field, wins over the
 * customer's Leitweg-ID, which only fills in when the caller passes nothing.
 */
export function resolveBuyerReference(
  explicit: string | null | undefined,
  customerLeitwegId: string | null,
): string | null {
  return normalizeBuyerReference(explicit === undefined ? customerLeitwegId : explicit);
}
