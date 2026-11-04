import type { ReverseChargeType } from "$lib/db/invoices";
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

type ReverseChargeSender = { isKleinunternehmer: boolean; vatId: string | null };
type ReverseChargeCustomer = { vatId: string | null };

export type ReverseChargeState = {
  canIntraEu: boolean;
  canThirdCountry: boolean;
  blockedReason: string;
  /** The chosen type when it is still permitted, otherwise "none". */
  allowedType: ReverseChargeType;
};

// Sender must not be Kleinunternehmer and needs a VAT-ID. intra_eu also needs the
// customer's VAT-ID; third_country (export outside EU) does not. Whether the
// customer is in the EU stays the user's judgement.
export function reverseChargeState(
  type: ReverseChargeType,
  sender: ReverseChargeSender,
  customer: ReverseChargeCustomer | null,
): ReverseChargeState {
  const canThirdCountry = !sender.isKleinunternehmer && !!sender.vatId;
  const canIntraEu = canThirdCountry && !!customer?.vatId;
  const permitted =
    type === "none" || (type === "intra_eu" ? canIntraEu : canThirdCountry);
  return {
    canIntraEu,
    canThirdCountry,
    blockedReason: reverseChargeBlockedReason(sender, customer),
    allowedType: permitted ? type : "none",
  };
}

function reverseChargeBlockedReason(
  sender: ReverseChargeSender,
  customer: ReverseChargeCustomer | null,
): string {
  if (sender.isKleinunternehmer) return "Nicht verfügbar für Kleinunternehmer (§ 19 UStG).";
  if (!sender.vatId) return "Eigene USt-IdNr. in den Einstellungen fehlt.";
  if (customer && !customer.vatId) return "EU-Reverse-Charge: Kunde benötigt USt-IdNr.";
  return "";
}

export function reverseChargeError(
  type: ReverseChargeType,
  sender: ReverseChargeSender,
  customer: ReverseChargeCustomer | null,
  items: Pick<LineItemForm, "vatRate">[],
): string | null {
  if (type === "none") return null;
  if (sender.isKleinunternehmer) return "Reverse-Charge ist für Kleinunternehmer nicht zulässig.";
  if (!sender.vatId) return "Reverse-Charge: eigene USt-IdNr. fehlt.";
  if (type === "intra_eu" && !customer?.vatId) {
    return "EU-Reverse-Charge erfordert eine USt-IdNr. des Kunden.";
  }
  if (items.some((item) => item.vatRate !== 0)) {
    return "Bei Reverse-Charge müssen alle Positionen 0 % USt haben.";
  }
  return null;
}
