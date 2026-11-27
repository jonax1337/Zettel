import { describe, expect, it } from "vitest";
import type { StatusTable } from "$lib/ui/status-meta";
import {
  customerFilterItems,
  fitsSegmentedStatus,
  numberOrAll,
  overdueDays,
  overdueLabel,
  overdueSinceLabel,
  segmentedStatusItems,
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

describe("overdueDays", () => {
  const DAY = 86_400;

  it("counts whole days after the due date", () => {
    expect(overdueDays(1_000, 1_000 + 11 * DAY + 5)).toBe(11);
  });

  it("is 0 within the first day and never negative", () => {
    expect(overdueDays(1_000, 1_000 + DAY - 1)).toBe(0);
    expect(overdueDays(1_000, 500)).toBe(0);
  });
});

describe("overdueLabel", () => {
  it("names the days, singular and plural", () => {
    expect(overdueLabel(1)).toBe("1 Tag überfällig");
    expect(overdueLabel(24)).toBe("24 Tage überfällig");
  });

  it("falls back to a plain label within the first day", () => {
    expect(overdueLabel(0)).toBe("Überfällig");
  });
});

describe("overdueSinceLabel", () => {
  it("reads after \"seit\"", () => {
    expect(overdueSinceLabel(0)).toBe("heute");
    expect(overdueSinceLabel(1)).toBe("1 Tag");
    expect(overdueSinceLabel(34)).toBe("34 Tagen");
  });
});

describe("segmented status filter", () => {
  const items = (count: number) => [
    { value: "all", label: "Alle Status" },
    ...Array.from({ length: count }, (_, i) => ({ value: `s${i}`, label: `Status ${i}` })),
  ];

  it("fits up to four statuses, the catch-all not counted", () => {
    expect(fitsSegmentedStatus(items(4))).toBe(true);
    expect(fitsSegmentedStatus(items(5))).toBe(false);
  });

  it("shortens only the catch-all label", () => {
    expect(segmentedStatusItems(items(1))).toEqual([
      { value: "all", label: "Alle" },
      { value: "s0", label: "Status 0" },
    ]);
  });
});
