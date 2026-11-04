export const INVALID_ROUTE_ID_MESSAGE = "Ungültige ID.";

export function parseRouteId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}
