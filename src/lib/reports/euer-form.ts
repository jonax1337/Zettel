/**
 * Anlage EÜR als Daten: welche Kennzahlen (Kz) Zettel ausfüllt und in welcher
 * Zeile sie im amtlichen Vordruck stehen. Die Kennzahlen sind in allen Jahren
 * gleich, nur die Zeilennummern wandern.
 *
 * Quellen: BMF-Schreiben vom 29.08.2025 (Anlage EÜR 2025) und 01.09.2026
 * (Anlage EÜR 2026), bundesfinanzministerium.de.
 */

export type EuerLineKind = "income" | "expense" | "sum" | "info";

/** Where the amount of a line comes from. */
export type EuerLineSource = "payments" | "categories" | "expenses" | "sum" | "none";

export type EuerLineDef = {
  kz: string;
  label: string;
  kind: EuerLineKind;
  filledBy: EuerLineSource;
  /** Shown for lines Zettel cannot fill or fills with a caveat. */
  hint?: string;
};

export const EUER_KZ = {
  incomeKleinunternehmer: "111",
  incomeTaxable: "112",
  incomeTaxFree: "103",
  incomeVat: "140",
  incomeSum: "159",
  expenseInputVat: "185",
  expenseOther: "183",
  expenseSum: "199",
} as const;

const NOT_RECORDED_HINT = "Zettel erfasst keine Zahlungen an das Finanzamt – bei Bedarf selbst ergänzen.";

export const EUER_LINES: EuerLineDef[] = [
  {
    kz: "111",
    label: "Betriebseinnahmen als umsatzsteuerlicher Kleinunternehmer (§ 19 Abs. 1 UStG)",
    kind: "income",
    filledBy: "payments",
  },
  { kz: "112", label: "Umsatzsteuerpflichtige Betriebseinnahmen (netto)", kind: "income", filledBy: "payments" },
  {
    kz: "103",
    label: "Umsatzsteuerfreie und nicht steuerbare Betriebseinnahmen, auch § 13b UStG (Reverse Charge)",
    kind: "income",
    filledBy: "payments",
  },
  { kz: "140", label: "Vereinnahmte Umsatzsteuer", kind: "income", filledBy: "payments" },
  {
    kz: "141",
    label: "Vom Finanzamt erstattete und ggf. verrechnete Umsatzsteuer",
    kind: "income",
    filledBy: "none",
    hint: NOT_RECORDED_HINT,
  },
  { kz: "159", label: "Summe Betriebseinnahmen", kind: "sum", filledBy: "sum" },
  { kz: "100", label: "Waren, Rohstoffe und Hilfsstoffe einschließlich Nebenkosten", kind: "expense", filledBy: "categories" },
  { kz: "110", label: "Bezogene Fremdleistungen", kind: "expense", filledBy: "categories" },
  {
    kz: "130/131/136",
    label: "Absetzung für Abnutzung (Übertrag aus Anlage AVEÜR)",
    kind: "info",
    filledBy: "none",
    hint: "AfA und Anlagevermögen sind in Zettel nicht erfasst – aus der Anlage AVEÜR übernehmen.",
  },
  {
    kz: "132",
    label: "Aufwendungen für geringwertige Wirtschaftsgüter (§ 6 Abs. 2 EStG)",
    kind: "expense",
    filledBy: "categories",
  },
  { kz: "150", label: "Miete/Pacht für Geschäftsräume", kind: "expense", filledBy: "categories" },
  { kz: "280", label: "Aufwendungen für Telekommunikation (z. B. Telefon, Internet)", kind: "expense", filledBy: "categories" },
  { kz: "221", label: "Übernachtungs- und Reisenebenkosten bei Geschäftsreisen", kind: "expense", filledBy: "categories" },
  { kz: "281", label: "Fortbildungskosten (ohne Reisekosten)", kind: "expense", filledBy: "categories" },
  { kz: "194", label: "Kosten für Rechts- und Steuerberatung, Buchführung", kind: "expense", filledBy: "categories" },
  { kz: "228", label: "Laufende EDV-Kosten", kind: "expense", filledBy: "categories" },
  { kz: "229", label: "Arbeitsmittel (z. B. Bürobedarf, Porto, Fachliteratur)", kind: "expense", filledBy: "categories" },
  { kz: "224", label: "Werbekosten", kind: "expense", filledBy: "categories" },
  {
    kz: "185",
    label: "Gezahlte und nach § 15 UStG abziehbare Vorsteuerbeträge",
    kind: "expense",
    filledBy: "expenses",
    hint: "Nicht bei Kleinunternehmern. Die Umsatzsteuer aus § 13b-Bezügen ist hier nicht enthalten.",
  },
  {
    kz: "186",
    label: "An das Finanzamt gezahlte und ggf. verrechnete Umsatzsteuer",
    kind: "expense",
    filledBy: "none",
    hint: NOT_RECORDED_HINT,
  },
  { kz: "183", label: "Übrige unbeschränkt abziehbare Betriebsausgaben", kind: "expense", filledBy: "categories" },
  { kz: "199", label: "Summe Betriebsausgaben", kind: "sum", filledBy: "sum" },
];

/** Expense categories can be assigned to these lines. */
export const EUER_CATEGORY_LINES = EUER_LINES.filter((line) => line.filledBy === "categories");

const AFA_KZ = "130/131/136";

/** Line number in the official form per tax year; ranges are written with an en dash. */
export const EUER_LINE_NUMBERS: Record<number, Record<string, string>> = {
  2025: {
    "111": "12",
    "112": "15",
    "103": "16",
    "140": "17",
    "141": "18",
    "159": "23",
    "100": "27",
    "110": "29",
    [AFA_KZ]: "31–33",
    "132": "36",
    "150": "39",
    "280": "43",
    "221": "44",
    "281": "45",
    "194": "46",
    "228": "50",
    "229": "51",
    "224": "54",
    "185": "57",
    "186": "58",
    "183": "60",
    "199": "75",
  },
  2026: {
    "111": "12",
    "112": "15",
    "103": "16",
    "140": "17",
    "141": "18",
    "159": "23",
    "100": "29",
    "110": "30",
    [AFA_KZ]: "32–34",
    "132": "37",
    "150": "40",
    "280": "44",
    "221": "45",
    "281": "46",
    "194": "47",
    "228": "51",
    "229": "52",
    "224": "55",
    "185": "58",
    "186": "59",
    "183": "61",
    "199": "76",
  },
};

export type FormYear = {
  year: number;
  /** False when the tax year has no form of its own and the nearest known form is shown. */
  exact: boolean;
};

/** The form whose line numbers apply to `taxYear`: its own, otherwise the nearest known one (the newer on a tie). */
export function formYearFor(taxYear: number): FormYear {
  const knownYears = Object.keys(EUER_LINE_NUMBERS).map(Number);
  const nearest = knownYears.reduce((best, year) => {
    const distance = Math.abs(year - taxYear);
    const bestDistance = Math.abs(best - taxYear);
    return distance < bestDistance || (distance === bestDistance && year > best) ? year : best;
  });
  return { year: nearest, exact: nearest === taxYear };
}
