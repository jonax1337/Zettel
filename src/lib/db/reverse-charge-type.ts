import type { ReverseChargeType } from "./invoices";

const REVERSE_CHARGE_TYPES: readonly ReverseChargeType[] = ["none", "intra_eu", "third_country"];

/**
 * Offers and recurring templates got a reverse_charge_type column in schema 28.
 * A partial restore of an older backup brings back only the boolean; such rows
 * fall back to intra-EU, the only kind the boolean could express.
 */
export function storedReverseChargeType(
  stored: string | null | undefined,
  isReverseCharge: boolean,
): ReverseChargeType {
  const type = REVERSE_CHARGE_TYPES.find((t) => t === stored) ?? "none";
  return type === "none" && isReverseCharge ? "intra_eu" : type;
}
