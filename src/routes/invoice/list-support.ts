export const ALL = "all";

type FilterItem<V extends string> = { value: V; label: string };

export function statusFilterItems<S extends string>(
  labels: Record<S, string>,
): FilterItem<S | typeof ALL>[] {
  const entries = Object.entries(labels) as [S, string][];
  return [
    { value: ALL, label: "Alle Status" },
    ...entries.map(([value, label]) => ({ value, label })),
  ];
}

export function yearFilterItems(years: number[]): FilterItem<string>[] {
  return [{ value: ALL, label: "Alle Jahre" }, ...years.map((y) => ({ value: String(y), label: String(y) }))];
}

export function customerFilterItems(
  customers: { id: number; name: string }[],
  allLabel = "Alle Kunden",
): FilterItem<string>[] {
  return [{ value: ALL, label: allLabel }, ...customers.map((c) => ({ value: String(c.id), label: c.name }))];
}

export function numberOrAll(value: string): number | typeof ALL {
  return value === ALL ? ALL : Number.parseInt(value, 10);
}

