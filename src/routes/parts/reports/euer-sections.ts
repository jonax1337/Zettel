import type { EuerLine } from "$lib/reports/euer";
import { EUER_KZ } from "$lib/reports/euer-form";

export type EuerSection = { title: string; lines: EuerLine[] };

/** The income block ends with its sum line; everything after it is expenses. */
export function splitEuerSections(lines: EuerLine[]): EuerSection[] {
  const incomeEnd = lines.findIndex((line) => line.kz === EUER_KZ.incomeSum) + 1;
  return [
    { title: "Betriebseinnahmen", lines: lines.slice(0, incomeEnd) },
    { title: "Betriebsausgaben", lines: lines.slice(incomeEnd) },
  ];
}

/**
 * A line without amount that has nothing to tell. Sums and lines with a hint stay visible,
 * because the hint says what the user has to add by hand (AfA, payments to the tax office).
 */
export function isEmptyEuerLine(line: EuerLine): boolean {
  return line.amountCent === null && line.kind !== "sum" && !line.hint;
}
