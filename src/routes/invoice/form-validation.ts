import { parseExchangeRateScaled } from "$lib/utils/currency";
import { fromIsoDate } from "$lib/utils/date";
import type { LineItemForm } from "./line-items";

export function exchangeRateError(currency: string, exchangeRate: string): string | null {
  if (currency === "EUR") return null;
  if (!exchangeRate || !parseExchangeRateScaled(exchangeRate)) {
    return `Wechselkurs erforderlich für ${currency}. Format: 1 EUR = X ${currency}.`;
  }
  return null;
}

export function servicePeriodError(startIso: string, endIso: string): string | null {
  if (!startIso || !endIso) return "Leistungszeitraum: Start- und Enddatum erforderlich.";
  if (fromIsoDate(endIso) < fromIsoDate(startIso)) {
    return "Leistungszeitraum: Enddatum vor Startdatum.";
  }
  return null;
}

export function linePeriodError(
  items: Pick<LineItemForm, "description" | "periodStartIso" | "periodEndIso">[],
): string | null {
  const reversed = items.find(
    (item) =>
      item.periodStartIso &&
      item.periodEndIso &&
      fromIsoDate(item.periodEndIso) < fromIsoDate(item.periodStartIso),
  );
  if (!reversed) return null;
  return `Positions-Zeitraum: Enddatum vor Startdatum (${reversed.description || "ohne Beschreibung"}).`;
}
