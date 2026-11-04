import { describe, expect, it } from "vitest";
import {
  customerFilterItems,
  numberOrAll,
  statusFilterItems,
  yearFilterItems,
} from "./list-support";

describe("statusFilterItems", () => {
  it("prepends the catch-all option and keeps the label order", () => {
    expect(statusFilterItems({ draft: "Entwurf", sent: "Versendet" })).toEqual([
      { value: "all", label: "Alle Status" },
      { value: "draft", label: "Entwurf" },
      { value: "sent", label: "Versendet" },
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
});

describe("numberOrAll", () => {
  it("keeps the catch-all and parses numeric values", () => {
    expect(numberOrAll("all")).toBe("all");
    expect(numberOrAll("2026")).toBe(2026);
  });
});
