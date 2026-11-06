export function normalizeBuyerReference(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

export type FollowedLeitweg = { customerId: number | null; leitwegId: string };

/**
 * The invoice form's field tracks the selected customer's Leitweg-ID until the user
 * edits it. Only a change of customer re-follows, and only a value that still equals
 * the previously followed default is replaced; opening a stored invoice keeps its value.
 */
export function followCustomerLeitweg(
  current: string,
  followed: FollowedLeitweg,
  next: FollowedLeitweg,
): { value: string; followed: FollowedLeitweg } {
  if (next.customerId === followed.customerId) return { value: current, followed };
  return { value: current === followed.leitwegId ? next.leitwegId : current, followed: next };
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
