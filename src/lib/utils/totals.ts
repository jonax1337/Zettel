/**
 * Pure line-total / VAT math, shared across invoices, offers and expenses.
 *
 * Cent-integer all the way. Per-position rounding (half up, towards +infinity
 * like Math.round) matches the Finanzamt convention: each line is rounded
 * individually before the VAT sum, so the totals shown to the customer
 * reconcile down to single cents.
 */

/** Quantities carry at most four decimals, as the ZUGFeRD XML renders them. */
const QUANTITY_SCALE = 10_000;
const HALF_QUANTITY_SCALE = 5_000n;

export type TotalsItem = {
  quantity: number;
  unitPrice: number; // cents
  vatRate: number; // percent (integer)
  /**
   * The amount already stored for this position; it wins over the product, so an unchanged position keeps its cents.
   * Deliberately not named lineTotal: rows that merely carry a lineTotal (stored or extracted) are still computed.
   */
  fixedLineTotal?: number;
};

export type Totals = {
  subtotal: number;
  vatAmount: number;
  total: number;
};

export type TotalsOpts = {
  isKleinunternehmer: boolean;
  isReverseCharge: boolean;
};

function scaleQuantity(quantity: number): number {
  return Math.round(quantity * QUANTITY_SCALE);
}

/**
 * The quantity as it is stored and printed; the line total is computed from exactly this value.
 * Throws for a missing quantity (a cleared number field arrives as null) instead of storing 0.
 */
export function roundQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) throw new Error("Menge fehlt oder ist ungültig.");
  return scaleQuantity(quantity) / QUANTITY_SCALE;
}

/**
 * quantity x unit price in whole cents, computed exactly: the float product is
 * not (0.47 x 8550 is 4018.4999999999995, the exact 4018.5 must round to 4019).
 * Mirrored by compute_line_total in cli/zettel.py.
 */
export function computeLineTotal(item: TotalsItem): number {
  if (item.fixedLineTotal !== undefined) return item.fixedLineTotal;
  // Half-typed editor input (empty quantity, fractional cents) must not throw in BigInt().
  if (!Number.isFinite(item.quantity) || !Number.isInteger(item.unitPrice)) {
    return Math.round(item.quantity * item.unitPrice);
  }
  const scaledTotal = BigInt(scaleQuantity(item.quantity)) * BigInt(item.unitPrice) + HALF_QUANTITY_SCALE;
  return Number(floorDivide(scaledTotal, BigInt(QUANTITY_SCALE)));
}

/** BigInt division truncates towards zero; this one floors, as negative lines need. */
function floorDivide(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  return dividend % divisor < 0n ? quotient - 1n : quotient;
}

export function computeTotals(items: TotalsItem[], opts: TotalsOpts): Totals {
  const vatExempt = opts.isKleinunternehmer || opts.isReverseCharge;
  let subtotal = 0;
  let vatAmount = 0;
  for (const item of items) {
    const line = computeLineTotal(item);
    subtotal += line;
    if (!vatExempt) {
      vatAmount += Math.round((line * item.vatRate) / 100);
    }
  }
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}
