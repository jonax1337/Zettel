import { describe, expect, it } from "vitest";
import type { WipeableTable } from "$lib/db/danger";
import {
  DANGER_CONFIRM_WORD,
  dangerActionDescription,
  dangerActionLabel,
  isDangerConfirmed,
  tableCountLabel,
} from "./danger-actions";

const labels = { invoices: "Rechnungen", customers: "Kunden" } as Record<WipeableTable, string>;

describe("isDangerConfirmed", () => {
  it("accepts the confirmation word, ignoring surrounding whitespace", () => {
    expect(isDangerConfirmed(DANGER_CONFIRM_WORD)).toBe(true);
    expect(isDangerConfirmed("  LÖSCHEN \n")).toBe(true);
  });
  it("rejects anything else, including a different case", () => {
    expect(isDangerConfirmed("")).toBe(false);
    expect(isDangerConfirmed("löschen")).toBe(false);
    expect(isDangerConfirmed("LOESCHEN")).toBe(false);
  });
});

describe("tableCountLabel", () => {
  it("uses the singular for exactly one table", () => {
    expect(tableCountLabel(1)).toBe("1 Tabelle");
  });
  it("uses the plural otherwise", () => {
    expect(tableCountLabel(2)).toBe("2 Tabellen");
    expect(tableCountLabel(0)).toBe("0 Tabellen");
  });
});

describe("dangerActionLabel", () => {
  it("names each action", () => {
    expect(dangerActionLabel({ kind: "wipeAll" })).toBe("Alle Geschäftsdaten löschen");
    expect(dangerActionLabel({ kind: "resetCounters" })).toBe(
      "Nummernzähler zurücksetzen",
    );
    expect(dangerActionLabel({ kind: "wipeTables", tables: ["invoices"] })).toBe("1 Tabelle leeren");
  });
});

describe("dangerActionDescription", () => {
  it("lists the selected tables by their display labels", () => {
    const description = dangerActionDescription(
      { kind: "wipeTables", tables: ["invoices", "customers"] },
      labels,
    );
    expect(description).toContain("Rechnungen, Kunden");
  });
});
