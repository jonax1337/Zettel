import { BILLING_INCREMENTS, centiHoursOf, type BillingGrouping, type BillingLine } from "$lib/time/billing";
import { formatHours } from "$lib/time/duration";
import { formatDate } from "$lib/utils/date";
import { pluralize } from "../parts/entity/format";

export const GROUPING_ITEMS: { value: BillingGrouping; label: string }[] = [
  { value: "perProject", label: "Eine Position pro Projekt" },
  { value: "perEntry", label: "Eine Position pro Eintrag" },
];

/** Select items keyed by the increment in minutes as text. */
export const INCREMENT_ITEMS = BILLING_INCREMENTS.map((minutes) => ({
  value: String(minutes),
  label: minutes === 1 ? "Exakt (Minuten)" : `${minutes} Min.`,
}));

export const ROUNDING_NOTE =
  "Menge = Stunden, kaufmännisch auf 0,01 Std gerundet; Betrag = Menge × Stundensatz. Ein Takt rundet die Zeit einer Position vorher auf.";

export function formatLinePeriod(start: number, end: number): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

/** The quantity as the invoice will show it, from the minutes it stands for. */
export function lineQuantityText(line: Pick<BillingLine, "billedMinutes">): string {
  return formatHours(centiHoursOf(line.billedMinutes));
}

/** A project without an hourly rate bills nothing; say so before the draft is created. */
export function unpricedLineWarning(lines: Pick<BillingLine, "unitPrice">[]): string | null {
  const count = lines.filter((line) => line.unitPrice === 0).length;
  if (count === 0) return null;
  return `${count} ${pluralize(count, "Position hat", "Positionen haben")} keinen Stundensatz und ${pluralize(count, "wird", "werden")} mit 0,00 € angelegt. Den Satz unter „Projekte“ hinterlegen.`;
}
