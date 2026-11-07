import { describe, expect, it } from "vitest";
import type { StatusTable } from "$lib/ui/status-meta";
import {
  customerFilterItems,
  numberOrAll,
  statusFilterItems,
  yearFilterItems,
} from "./list-support";

describe("statusFilterItems", () => {
  const table: StatusTable<"draft" | "sent"> = {
    draft: { label: "Entwurf", variant: "secondary" },
    sent: { label: "Versendet", variant: "warning" },
  };

  it("prepends the catch-all option and keeps the table order", () => {
    expect(statusFilterItems(table)).toEqual([
      { value: "all", label: "Alle Status" },
      { value: "draft", label: "Entwurf" },
      { value: "sent", label: "Versendet" },
    ]);
  });

  it("follows an explicit order", () => {
    expect(statusFilterItems(table, ["sent", "draft"]).map((item) => item.value)).toEqual([
      "all",
      "sent",
      "draft",
    ]);
  });
});

describe("year and customer filter items", () => {
  it("stringify ids and years behind the catch-all option", () => {
    expect(yearFilterItems([2026, 2025])).toEqual([
      { value: "all", label: "Alle Jahre" },
      { value: "2026", label: "2026" },
      { value: "2025", label: "2025" },
    ]);
    expect(customerFilterItems([{ id: 7, name: "ACME" }])).toEqual([
      { value: "all", label: "Alle Kunden" },
      { value: "7", label: "ACME" },
    ]);
  });

  it("labels the catch-all option for another counterparty", () => {
    expect(customerFilterItems([], "Alle Lieferanten")).toEqual([
      { value: "all", label: "Alle Lieferanten" },
    ]);
  });
});

describe("numberOrAll", () => {
  it("keeps the catch-all and parses numeric values", () => {
    expect(numberOrAll("all")).toBe("all");
    expect(numberOrAll("2026")).toBe(2026);
  });
});
