import { describe, expect, it } from "vitest";
import {
  exchangeRateError,
  linePeriodError,
  reverseChargeError,
  reverseChargeState,
  servicePeriodError,
} from "./form-validation";

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

describe("reverseChargeState", () => {
  const sender = { isKleinunternehmer: false, vatId: "DE123456789" };
  const euCustomer = { vatId: "FR12345678901" };
  const privateCustomer = { vatId: null };

  it("allows both types when sender and customer have a VAT-ID", () => {
    expect(reverseChargeState("intra_eu", sender, euCustomer)).toMatchObject({
      canIntraEu: true,
      canThirdCountry: true,
      allowedType: "intra_eu",
      blockedReason: "",
    });
  });

  it("allows third-country export without a customer VAT-ID but not intra-EU", () => {
    const state = reverseChargeState("third_country", sender, privateCustomer);
    expect(state).toMatchObject({ canIntraEu: false, canThirdCountry: true, allowedType: "third_country" });
    expect(state.blockedReason).toBe("");
  });

  it("explains the missing customer VAT-ID only for intra-EU", () => {
    expect(reverseChargeState("intra_eu", sender, privateCustomer).blockedReason).toContain(
      "Kunde benötigt USt-IdNr.",
    );
    expect(reverseChargeState("intra_eu", sender, null).blockedReason).toBe("Erst Kunden auswählen.");
  });

  it("stays quiet for an ordinary document to a customer without VAT-ID", () => {
    expect(reverseChargeState("none", sender, privateCustomer).blockedReason).toBe("");
  });

  it("resets intra-EU when the customer has no VAT-ID or none is selected", () => {
    expect(reverseChargeState("intra_eu", sender, privateCustomer).allowedType).toBe("none");
    expect(reverseChargeState("intra_eu", sender, null).allowedType).toBe("none");
  });

  it("blocks everything for a Kleinunternehmer", () => {
    const state = reverseChargeState("third_country", { ...sender, isKleinunternehmer: true }, euCustomer);
    expect(state).toMatchObject({ canIntraEu: false, canThirdCountry: false, allowedType: "none" });
    expect(state.blockedReason).toContain("Kleinunternehmer");
  });

  it("blocks everything without an own VAT-ID", () => {
    const state = reverseChargeState("intra_eu", { ...sender, vatId: null }, euCustomer);
    expect(state.allowedType).toBe("none");
    expect(state.blockedReason).toContain("Eigene USt-IdNr.");
  });

  it("keeps none and stays quiet before a customer is selected", () => {
    expect(reverseChargeState("none", sender, null)).toMatchObject({ allowedType: "none", blockedReason: "" });
  });
});

describe("reverseChargeError", () => {
  const sender = { isKleinunternehmer: false, vatId: "DE123456789" };
  const euCustomer = { vatId: "FR12345678901" };
  const zeroRated = [{ vatRate: 0 }];

  it("has nothing to report without reverse charge", () => {
    expect(reverseChargeError("none", { isKleinunternehmer: true, vatId: null }, null, [{ vatRate: 19 }])).toBeNull();
  });

  it("rejects a Kleinunternehmer and a missing sender VAT-ID", () => {
    expect(reverseChargeError("intra_eu", { ...sender, isKleinunternehmer: true }, euCustomer, zeroRated)).toContain(
      "Kleinunternehmer",
    );
    expect(reverseChargeError("third_country", { ...sender, vatId: null }, null, zeroRated)).toContain(
      "eigene USt-IdNr.",
    );
  });

  it("requires the customer VAT-ID only for intra-EU", () => {
    expect(reverseChargeError("intra_eu", sender, { vatId: null }, zeroRated)).toContain("USt-IdNr. des Kunden");
    expect(reverseChargeError("third_country", sender, { vatId: null }, zeroRated)).toBeNull();
  });

  it("requires 0 % VAT on every position", () => {
    expect(reverseChargeError("intra_eu", sender, euCustomer, [{ vatRate: 0 }, { vatRate: 19 }])).toContain("0 % USt");
    expect(reverseChargeError("intra_eu", sender, euCustomer, zeroRated)).toBeNull();
  });
});
