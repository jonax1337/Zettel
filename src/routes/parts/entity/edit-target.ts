export const INVALID_ID_MESSAGE = "Ungültige ID.";

export function parseId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

export type EditTarget<T> = { id: number; value: T } | { error: string };

/** Resolves the record an edit route points at; failures come back as a user-facing message. */
export async function fetchEditTarget<T>(
  rawId: string | undefined,
  fetchById: (id: number) => Promise<T | null>,
  notFoundMessage: string,
): Promise<EditTarget<T>> {
  const id = parseId(rawId);
  if (id === null) return { error: INVALID_ID_MESSAGE };
  const value = await fetchById(id);
  return value === null ? { error: notFoundMessage } : { id, value };
}
