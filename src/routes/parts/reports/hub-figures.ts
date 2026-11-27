import type { TaxRücklageResult } from "$lib/dashboard/tax";
import type { EuerReport } from "$lib/reports/euer";
import type { UstvaReport, UstvaSummary } from "$lib/reports/ustva";
import { centsToEur } from "$lib/utils/money";
import type { ReserveView } from "./reserve-summary";
import { isUstvaQuarterRunning, payableNoun } from "./ustva-view";

export type ReportFigure = { value: string; caption: string };

export function ustvaFigure(report: UstvaReport, summary: UstvaSummary, nowUnix: number): ReportFigure {
  if (summary.kind === "kleinunternehmer") return { value: "entfällt", caption: "Kleinunternehmer (§ 19 UStG)" };
  const since = isUstvaQuarterRunning(report, nowUnix) ? " bisher" : "";
  return {
    value: centsToEur(Math.abs(summary.payableCent)),
    caption: `${payableNoun(summary.payableCent)} im ${report.quarter}. Quartal${since}`,
  };
}

export function euerFigure(report: EuerReport): ReportFigure {
  return {
    value: centsToEur(Math.abs(report.surplusCent)),
    caption: `${report.surplusCent < 0 ? "Fehlbetrag" : "Überschuss"} ${report.year} bisher`,
  };
}

export function reserveFigure(result: TaxRücklageResult, view: ReserveView): ReportFigure {
  const when = view === "projected" ? `${result.year}, aufs Jahr hochgerechnet` : `${result.year}, Stand heute`;
  return { value: centsToEur(result[view].recommendedReserveCent), caption: `noch zurücklegen, ${when}` };
}
