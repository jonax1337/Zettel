import { describe, expect, it } from "vitest";
import { newLineItem } from "../../invoice/line-items";
import {
  documentErrors,
  firstError,
  MISSING_CUSTOMER_MESSAGE,
  MISSING_NAME_MESSAGE,
  type DocumentFormState,
} from "./editor-validation";

function pricedItem(description = "Wartung", unitPrice = 9500) {
  return { ...newLineItem(19), description, unitPrice };
}

const valid: DocumentFormState = {
  customerId: 1,
  customer: { vatId: null },
  items: [pricedItem()],
  itemsRule: "any",
  sender: { isKleinunternehmer: false, vatId: "DE123456789" },
  reverseChargeType: "none",
  currency: { code: "EUR", exchangeRate: "" },
};

describe("documentErrors", () => {
  it("finds nothing wrong with a complete form", () => {
    expect(documentErrors(valid)).toEqual({});
  });

  it("asks for a customer under the customer key", () => {
    expect(documentErrors({ ...valid, customerId: null })).toEqual({ customer: MISSING_CUSTOMER_MESSAGE });
  });

  it("needs only a position for an invoice, but a position with description and price for an offer", () => {
    const items = [pricedItem("Wartung", 0)];
    expect(documentErrors({ ...valid, items }).items).toBeUndefined();
    expect(documentErrors({ ...valid, items, itemsRule: "billable" }).items).toMatch(/Beschreibung und Preis/);
    expect(documentErrors({ ...valid, items: [pricedItem("Wartung", 9500)], itemsRule: "billable" }).items).toBeUndefined();
  });

  it("asks for a position when there is none, for both rules", () => {
    expect(documentErrors({ ...valid, items: [] }).items).toMatch(/Mindestens eine Position/);
    expect(documentErrors({ ...valid, items: [], itemsRule: "billable" }).items).toMatch(/Mindestens eine Position/);
  });

  it("requires an exchange rate for a foreign currency", () => {
    const errors = documentErrors({ ...valid, currency: { code: "USD", exchangeRate: "" } });
    expect(errors.exchangeRate).toMatch(/Wechselkurs erforderlich für USD/);
  });

  it("checks the service period only when the form uses one", () => {
    expect(documentErrors(valid).servicePeriod).toBeUndefined();
    const errors = documentErrors({ ...valid, servicePeriod: { startIso: "2026-05-02", endIso: "2026-05-01" } });
    expect(errors.servicePeriod).toMatch(/Enddatum vor Startdatum/);
  });

  it("reports reverse charge without the customer's VAT-ID next to the reverse charge field", () => {
    const errors = documentErrors({ ...valid, reverseChargeType: "intra_eu", items: [pricedItem()] });
    expect(errors.reverseCharge).toMatch(/USt-IdNr\. des Kunden/);
  });

  it("collects several problems at once", () => {
    const errors = documentErrors({ ...valid, customerId: null, currency: { code: "USD", exchangeRate: "" } });
    expect(Object.keys(errors).sort()).toEqual(["customer", "exchangeRate"]);
  });

  it("asks for the name of a template that has none", () => {
    expect(documentErrors({ ...valid, name: "  " }).name).toBe(MISSING_NAME_MESSAGE);
    expect(documentErrors({ ...valid, name: "Retainer" }).name).toBeUndefined();
  });

  it("skips the reverse charge check while the settings load", () => {
    expect(documentErrors({ ...valid, sender: null, reverseChargeType: "intra_eu" }).reverseCharge).toBeUndefined();
  });

  it("reports a cleared quantity", () => {
    const cleared = { ...pricedItem(), quantity: Number.NaN };
    expect(documentErrors({ ...valid, items: [cleared] }).quantity).toMatch(/Menge fehlt/);
  });
});

describe("firstError", () => {
  it("returns the message of the field that comes first on the page", () => {
    expect(firstError({ exchangeRate: "Kurs", customer: "Kunde" })).toBe("Kunde");
    expect(firstError({ items: "Positionen", servicePeriod: "Zeitraum" })).toBe("Zeitraum");
    expect(firstError({ reverseCharge: "RC", name: "Name" })).toBe("Name");
  });

  it("returns null without errors", () => {
    expect(firstError({})).toBeNull();
  });
});
