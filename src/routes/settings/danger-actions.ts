import type { WipeableTable } from "$lib/db/danger";

export const DANGER_CONFIRM_WORD = "LÖSCHEN";

export type DangerAction =
  | { kind: "wipeAll" }
  | { kind: "wipeTables"; tables: WipeableTable[] }
  | { kind: "resetCounters" };

export function isDangerConfirmed(typed: string): boolean {
  return typed.trim() === DANGER_CONFIRM_WORD;
}

export function tableCountLabel(count: number): string {
  return `${count} Tabelle${count === 1 ? "" : "n"}`;
}

export function dangerActionLabel(action: DangerAction): string {
  switch (action.kind) {
    case "wipeAll":
      return "Alle Geschäftsdaten löschen";
    case "resetCounters":
      return "Nummernzähler zurücksetzen";
    case "wipeTables":
      return `${tableCountLabel(action.tables.length)} leeren`;
  }
}

export function dangerActionDescription(
  action: DangerAction,
  tableLabels: Record<WipeableTable, string>,
): string {
  switch (action.kind) {
    case "wipeAll":
      return "Rechnungen, Angebote, Mahnungen, Ausgaben, Kunden, Lieferanten, wiederkehrende Rechnungen und Steuer-Vorauszahlungen werden gelöscht. Einstellungen (Firma, Steuerprofil, Logo, Zählerstand) bleiben.";
    case "resetCounters":
      return "Zähler für Rechnungs-/Angebots-/Ausgaben-/Mahnungs-/Lieferanten-Nummern springen auf 0. Bestehende Datensätze bleiben unangetastet — passt nur zum Stand wenn du vorher die Tabellen geleert hast.";
    case "wipeTables":
      return `Die folgenden Daten werden gelöscht: ${joinTableLabels(action.tables, tableLabels)}. Verknüpfte Datensätze (z. B. Positionen, abhängige Mahnungen) werden automatisch mitgelöscht.`;
  }
}

export function joinTableLabels(
  tables: WipeableTable[],
  tableLabels: Record<WipeableTable, string>,
): string {
  return tables.map((t) => tableLabels[t]).join(", ");
}
