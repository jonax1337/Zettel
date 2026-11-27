import { isRunning, periodForQuarter } from "$lib/dashboard/period";
import type { UstvaReport, UstvaRow } from "$lib/reports/ustva";

export function isEmptyUstvaRow(row: UstvaRow): boolean {
  return row.amount === 0;
}

/** "bisher" is only true while the quarter has not ended. */
export function isUstvaQuarterRunning(report: UstvaReport, nowUnix: number): boolean {
  return isRunning(periodForQuarter(report.year, report.quarter), nowUnix);
}

export function payableNoun(payableCent: number): "Zahllast" | "Erstattung" {
  return payableCent < 0 ? "Erstattung" : "Zahllast";
}

export function payableLabel(payableCent: number, running: boolean): string {
  return running ? `${payableNoun(payableCent)} bisher` : payableNoun(payableCent);
}
