import { describe, expect, it } from "vitest";
import { fileNameOf, remainderNote, statementSummary } from "./statement-summary";

describe("fileNameOf", () => {
  it("strips Windows and POSIX folders", () => {
    expect(fileNameOf("C:\\Bank\\auszug.xml")).toBe("auszug.xml");
    expect(fileNameOf("/home/me/auszug.sta")).toBe("auszug.sta");
    expect(fileNameOf("auszug.txt")).toBe("auszug.txt");
  });
});

describe("statementSummary", () => {
  it("names the count and the date range", () => {
    const bookings = [{ valutaDate: "2026-11-26" }, { valutaDate: "2026-11-02" }, { valutaDate: "2026-11-09" }];
    expect(statementSummary(bookings)).toBe("3 Buchungen vom 2.11.2026 bis 26.11.2026");
  });

  it("collapses a single day and survives missing dates", () => {
    expect(statementSummary([{ valutaDate: "2026-11-02" }])).toBe("1 Buchung vom 2.11.2026");
    expect(statementSummary([{ valutaDate: "" }])).toBe("1 Buchung");
    expect(statementSummary([])).toBe("0 Buchungen");
  });
});

describe("remainderNote", () => {
  it("is silent when the payment settles the invoice", () => {
    expect(remainderNote(56525, 56525, "EUR")).toBeNull();
  });

  it("names what stays open after a partial payment", () => {
    expect(remainderNote(30000, 56525, "EUR")).toMatch(/^Teilzahlung, .*265,25.* bleiben offen$/);
  });

  it("names an overpayment", () => {
    expect(remainderNote(60000, 56525, "EUR")).toMatch(/34,75.* mehr als offen$/);
  });
});
