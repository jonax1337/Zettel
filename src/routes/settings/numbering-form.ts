import type { Settings } from "$lib/db/schema";

export type NumberSequenceKey = "invoice" | "offer" | "reminder" | "expense";

type SequenceFields = {
  key: NumberSequenceKey;
  title: string;
  formatKey: "invoiceNumberFormat" | "offerNumberFormat" | "reminderNumberFormat" | "expenseNumberFormat";
  counterKey: "invoiceNumberCounter" | "offerNumberCounter" | "reminderNumberCounter" | "expenseNumberCounter";
};

/** The number sequences of the settings row that drawNextNumber() counts, in display order. */
export const NUMBER_SEQUENCES: readonly SequenceFields[] = [
  { key: "invoice", title: "Rechnungen", formatKey: "invoiceNumberFormat", counterKey: "invoiceNumberCounter" },
  { key: "offer", title: "Angebote", formatKey: "offerNumberFormat", counterKey: "offerNumberCounter" },
  { key: "reminder", title: "Mahnungen", formatKey: "reminderNumberFormat", counterKey: "reminderNumberCounter" },
  {
    key: "expense",
    title: "Ausgaben (interne Nummer)",
    formatKey: "expenseNumberFormat",
    counterKey: "expenseNumberCounter",
  },
];

// formatInvoiceNumber() fills {N} to {NNNN} only; any other run of N stays literal.
const RUNNING_NUMBER = /\{N{1,4}\}/;
const OVERLONG_RUNNING_NUMBER = /\{N{5,}\}/;

export function numberFormatProblem(format: string | null | undefined): string | null {
  if (!format?.trim()) return "Gib ein Nummernformat an, zum Beispiel mit {NNNN} für die laufende Nummer.";
  if (OVERLONG_RUNNING_NUMBER.test(format)) {
    return "Die laufende Nummer hat höchstens vier Stellen. Nimm {N} bis {NNNN}.";
  }
  if (!RUNNING_NUMBER.test(format)) {
    return "Das Format braucht einen Platzhalter für die laufende Nummer, zum Beispiel {NNNN}. Sonst wäre jede Nummer gleich.";
  }
  return null;
}

/** The counter holds the last number handed out; 0 starts the sequence over. */
export function counterProblem(counter: number | null | undefined): string | null {
  if (typeof counter !== "number" || Number.isNaN(counter)) {
    return "Gib den aktuellen Zähler an, zum Beispiel 0 für einen Neustart.";
  }
  if (!Number.isInteger(counter)) return "Der Zähler ist eine ganze Zahl.";
  if (counter < 0) return "Der Zähler darf nicht negativ sein.";
  return null;
}

export type SequenceProblems = { format: string | null; counter: string | null };

export function numberingProblems(settings: Settings): Record<NumberSequenceKey, SequenceProblems> {
  const entries = NUMBER_SEQUENCES.map(({ key, formatKey, counterKey }) => [
    key,
    { format: numberFormatProblem(settings[formatKey]), counter: counterProblem(settings[counterKey]) },
  ]);
  return Object.fromEntries(entries) as Record<NumberSequenceKey, SequenceProblems>;
}

/** Why the settings must not be saved yet, or null when every sequence is usable. */
export function numberingBlockReason(settings: Settings): string | null {
  const problems = Object.values(numberingProblems(settings));
  const hasProblem = problems.some((p) => p.format !== null || p.counter !== null);
  return hasProblem ? "Nicht gespeichert: Prüfe die markierten Nummernkreise." : null;
}
