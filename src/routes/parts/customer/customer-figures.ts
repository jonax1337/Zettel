import { formatDuration } from "$lib/time/duration";
import { pluralize } from "../entity/format";

/** The value of "Zahlt im Schnitt nach", so it takes the dative: "1 Tag", "12 Tagen". */
export function paymentDaysLabel(days: number): string {
  return `${days} ${pluralize(days, "Tag", "Tagen")}`;
}

/** 270 minutes as "4:30 Std". */
export function unbilledTimeLabel(minutes: number): string {
  return `${formatDuration(minutes)} Std`;
}

export function openInvoicesHint(count: number): string | undefined {
  return count === 0 ? undefined : `${count} ${pluralize(count, "Rechnung", "Rechnungen")}`;
}
