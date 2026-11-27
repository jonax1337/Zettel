export type LegendItem = {
  label: string;
  /** CSS colour, always a chart token such as var(--series-1). */
  color: string;
  shape: "box" | "line" | "hatch";
};

/** One month of the income and expense chart; amounts are net EUR cents. */
export type IncomeMonth = {
  key: string;
  year: number;
  /** 1 to 12. */
  month: number;
  /** Short axis label such as "Mai". */
  label: string;
  /** Tooltip heading such as "Mai 2026". */
  title: string;
  revenue: number;
  grossRevenue: number;
  expenses: number;
  /** Net revenue of the same month one year earlier. */
  lastYearRevenue: number;
  /** A month that has not begun: no bars, only the marker. */
  future: boolean;
};

/** One column of the expected payments chart; amounts are EUR cents. */
export type ExpectedColumn = {
  key: string;
  label: string;
  overdue: number;
  open: number;
  estimate: number;
  tooltip: string;
};
