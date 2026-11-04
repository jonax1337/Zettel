const YEARS_BEFORE_CURRENT = 2;
const YEARS_AFTER_CURRENT = 1;

/** Calendar year a dashboard period falls into; income tax is assessed per year. */
export function taxYearOfPeriod(period: { start: number }): number {
  return new Date(period.start * 1000).getFullYear();
}

/** Years offered for the tax report: a window around today plus the year that is currently selected. */
export function selectableTaxYears(currentYear: number, selectedYear: number): number[] {
  const years = new Set<number>([selectedYear]);
  for (let year = currentYear - YEARS_BEFORE_CURRENT; year <= currentYear + YEARS_AFTER_CURRENT; year++) {
    years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}
