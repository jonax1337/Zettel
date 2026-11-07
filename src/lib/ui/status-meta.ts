import type { BadgeVariant } from "./Badge.svelte";

export type StatusTable<S extends string> = Record<S, { label: string; variant: BadgeVariant }>;

/** Splits a status table into the label and variant lookups pages index by status. */
export function statusMeta<S extends string>(table: StatusTable<S>) {
  const entries = Object.entries(table) as [S, StatusTable<S>[S]][];
  return {
    label: Object.fromEntries(entries.map(([status, meta]) => [status, meta.label])) as Record<S, string>,
    variant: Object.fromEntries(entries.map(([status, meta]) => [status, meta.variant])) as Record<
      S,
      BadgeVariant
    >,
  };
}
