import type { Expense } from "$lib/db/schema";

export type ComparableExpense = Pick<
  Expense,
  "id" | "internalNumber" | "number" | "vendorId" | "issueDate" | "total" | "status"
>;

export type DuplicateCandidate = {
  /** Id of the expense being edited; null while it is still new. */
  id: number | null;
  vendorId: number;
  number: string | null;
  issueDate: number;
  total: number;
};

function normalizeNumber(number: string | null): string {
  return number?.trim().toLowerCase() ?? "";
}

/**
 * An existing, non-cancelled expense of the same vendor with the same Beleg-Nr.
 * Without a Beleg-Nr. the amount and invoice date have to agree instead.
 */
export function findDuplicateExpense(
  existing: ComparableExpense[],
  candidate: DuplicateCandidate,
): ComparableExpense | null {
  const wantedNumber = normalizeNumber(candidate.number);
  return (
    existing.find((other) => {
      if (other.id === candidate.id || other.status === "cancelled") return false;
      if (other.vendorId !== candidate.vendorId) return false;
      if (wantedNumber) return normalizeNumber(other.number) === wantedNumber;
      return other.total === candidate.total && other.issueDate === candidate.issueDate;
    }) ?? null
  );
}
