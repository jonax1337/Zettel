import { describe, expect, it } from "vitest";
import { exchangeRateError, linePeriodError, servicePeriodError } from "./form-validation";

describe("exchangeRateError", () => {
  it("needs no rate for EUR", () => {
    expect(exchangeRateError("EUR", "")).toBeNull();
  });

  it("requires a parseable rate for foreign currencies", () => {
    expect(exchangeRateError("USD", "")).toContain("USD");
    expect(exchangeRateError("USD", "abc")).toContain("Wechselkurs erforderlich");
    expect(exchangeRateError("USD", "0")).not.toBeNull();
    expect(exchangeRateError("USD", "1,0832")).toBeNull();
  });
});

describe("servicePeriodError", () => {
  it("requires both dates", () => {
    expect(servicePeriodError("2026-03-01", "")).toContain("erforderlich");
    expect(servicePeriodError("", "2026-03-01")).toContain("erforderlich");
  });

  it("rejects an end date before the start date", () => {
    expect(servicePeriodError("2026-03-10", "2026-03-01")).toContain("Enddatum vor Startdatum");
  });

  it("accepts a single day and a regular range", () => {
    expect(servicePeriodError("2026-03-01", "2026-03-01")).toBeNull();
    expect(servicePeriodError("2026-03-01", "2026-03-31")).toBeNull();
  });
});

describe("linePeriodError", () => {
  it("names the offending position", () => {
    const message = linePeriodError([
      { description: "OK", periodStartIso: "2026-03-01", periodEndIso: "2026-03-02" },
      { description: "Beratung", periodStartIso: "2026-03-05", periodEndIso: "2026-03-01" },
    ]);
    expect(message).toContain("Beratung");
  });

  it("labels a position without description", () => {
    const message = linePeriodError([
      { description: "", periodStartIso: "2026-03-05", periodEndIso: "2026-03-01" },
    ]);
    expect(message).toContain("ohne Beschreibung");
  });

  it("ignores positions with no or half-set period", () => {
    expect(
      linePeriodError([
        { description: "a", periodStartIso: "", periodEndIso: "" },
        { description: "b", periodStartIso: "2026-03-05", periodEndIso: "" },
      ]),
    ).toBeNull();
  });
});
