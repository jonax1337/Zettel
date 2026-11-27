import { toTotalsItem, type LineItemForm } from "../../invoice/line-items";

/** The position still carries the amount it was saved with, because quantity and price have not been touched. */
export function keepsSavedAmount(item: LineItemForm): boolean {
  return toTotalsItem(item).fixedLineTotal !== undefined;
}

export const SAVED_AMOUNTS_HINT =
  "Gespeicherte Beträge bleiben unverändert, bis du Menge oder Preis einer Position änderst.";
