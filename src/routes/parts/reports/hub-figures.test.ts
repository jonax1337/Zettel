import { describe, expect, it } from "vitest";
import type { TaxRücklageResult } from "$lib/dashboard/tax";
import type { EuerReport } from "$lib/reports/euer";
import type { UstvaReport, UstvaSummary } from "$lib/reports/ustva";
import { centsToEur } from "$lib/utils/money";
import { DEFAULT_RESERVE_VIEW } from "./reserve-summary";
import { euerFigure, reserveFigure, ustvaFigure } from "./hub-figures";

const quarter4: UstvaReport = { year: 2026, quarter: 4, dateFrom: 0, dateTo: 0, vatAccounting: "accrual", rows: [] };
const at = (year: number, month: number, day: number) => Math.floor(new Date(year, month - 1, day, 12).getTime() / 1000);
const computed = (payableCent: number): UstvaSummary => ({ kind: "computed", outputVatCent: 0, inputVatCent: 0, payableCent });

describe("ustvaFigure", () => {
  it("shows the Zahllast of a running quarter as bisher", () => {
    expect(ustvaFigure(quarter4, computed(71_725), at(2026, 11, 27))).toEqual({
      value: centsToEur(71_725),
      caption: "Zahllast im 4. Quartal bisher",
    });
  });

  it("drops bisher once the quarter is over", () => {
    expect(ustvaFigure(quarter4, computed(71_725), at(2027, 1, 20)).caption).toBe("Zahllast im 4. Quartal");
  });

  it("shows a refund as a positive amount named Erstattung", () => {
    expect(ustvaFigure(quarter4, computed(-5_000), at(2026, 11, 27))).toEqual({
      value: centsToEur(5_000),
      caption: "Erstattung im 4. Quartal bisher",
    });
  });

  it("shows no Zahllast for a Kleinunternehmer", () => {
    expect(ustvaFigure(quarter4, { kind: "kleinunternehmer" }, at(2026, 11, 27))).toEqual({
      value: "entfällt",
      caption: "Kleinunternehmer (§ 19 UStG)",
    });
  });
});

describe("euerFigure", () => {
  it("names a surplus and a deficit differently, both unsigned", () => {
    expect(euerFigure({ year: 2026, surplusCent: 2_188_410 } as EuerReport)).toEqual({
      value: centsToEur(2_188_410),
      caption: "Überschuss 2026 bisher",
    });
    expect(euerFigure({ year: 2026, surplusCent: -1_500 } as EuerReport)).toEqual({
      value: centsToEur(1_500),
      caption: "Fehlbetrag 2026 bisher",
    });
  });
});

describe("reserveFigure", () => {
  const result = {
    year: 2026,
    ytd: { recommendedReserveCent: 64_000 },
    projected: { recommendedReserveCent: 123_400 },
  } as TaxRücklageResult;

  it("reads the scenario of the chosen view", () => {
    expect(reserveFigure(result, "ytd").value).toBe(centsToEur(64_000));
    expect(reserveFigure(result, "projected").value).toBe(centsToEur(123_400));
  });

  it("names year and view in the caption", () => {
    expect(reserveFigure(result, "ytd").caption).toBe("noch zurücklegen, 2026, Stand heute");
    expect(reserveFigure(result, DEFAULT_RESERVE_VIEW).caption).toContain("hochgerechnet");
  });
});
