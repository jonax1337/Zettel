/** The tabs of the Auswertungen area; every page of the area shows them. Hrefs follow REPORT_PAGES. */
export type ReportTab = { href: string; label: string };

export const REPORT_TABS: ReportTab[] = [
  { href: "/reports", label: "Überblick" },
  { href: "/reports/ustva", label: "UStVA" },
  { href: "/reports/euer", label: "Anlage EÜR" },
  { href: "/reports/taxes", label: "Steuer-Rücklage" },
  { href: "/export", label: "DATEV-Export" },
  { href: "/validate", label: "E-Rechnung prüfen" },
];
