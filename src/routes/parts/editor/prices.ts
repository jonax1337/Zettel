import { commitPriceText } from "../entity/format";
import type { LineItemForm } from "../../invoice/line-items";

/**
 * The price field commits on blur only; Enter submits first, so pending text must be
 * parsed before the form is validated or saved.
 */
export function commitPendingPrices(items: LineItemForm[]): void {
  for (const item of items) commitPriceText(item);
}
