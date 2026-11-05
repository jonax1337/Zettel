export function queryParam(querystring: string | undefined, key: string): string | null {
  return new URLSearchParams(querystring ?? "").get(key);
}

export function intQueryParam(querystring: string | undefined, key: string): number | null {
  const raw = queryParam(querystring, key);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function preselectedCustomerId(
  querystring: string | undefined,
  customers: readonly { id: number }[],
): string {
  const requested = intQueryParam(querystring, "customerId");
  return customers.some((c) => c.id === requested) ? String(requested) : "";
}
