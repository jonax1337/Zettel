import { describe, expect, it } from "vitest";
import { INVALID_COUNTRY_MESSAGE } from "./country";
import { validateCatalogItem, validateParty } from "./entity-validation";
import { emptyPartyFields, type PartyFields } from "./party-form";

const party = (over: Partial<PartyFields> = {}): PartyFields => ({
  ...emptyPartyFields(),
  name: "Muster GmbH",
  street: "Weg 1",
  postalCode: "10115",
  city: "Berlin",
  ...over,
});

describe("validateParty", () => {
  it("accepts a complete customer", () => {
    expect(validateParty(party(), { requireAddress: true })).toEqual({});
  });

  it("requires name and the full address for customers", () => {
    const errors = validateParty(emptyPartyFields(), { requireAddress: true });
    expect(Object.keys(errors).sort()).toEqual(["city", "name", "postalCode", "street"]);
  });

  it("lets vendors leave the address empty but not the name", () => {
    const errors = validateParty(emptyPartyFields(), { requireAddress: false });
    expect(Object.keys(errors)).toEqual(["name"]);
  });

  it("treats whitespace as empty", () => {
    expect(validateParty(party({ name: "   " }), { requireAddress: false }).name).toBeDefined();
  });

  it("asks for the country and rejects anything but a two-letter code", () => {
    expect(validateParty(party({ country: "" }), { requireAddress: false }).country).toContain("ISO");
    expect(validateParty(party({ country: "DEU" }), { requireAddress: false }).country).toBe(INVALID_COUNTRY_MESSAGE);
    expect(validateParty(party({ country: " at " }), { requireAddress: false }).country).toBeUndefined();
  });

  it("checks the e-mail only when one is given", () => {
    expect(validateParty(party({ email: null }), { requireAddress: false }).email).toBeUndefined();
    expect(validateParty(party({ email: "" }), { requireAddress: false }).email).toBeUndefined();
  });

  it.each(["a@b.de", "a@b", "  a@b.de ", "a.b+c@sub.example.de", "o'neil@ex-ample.com", "a@münchen.de"])(
    "accepts the address %j like the browser does",
    (email) => {
      expect(validateParty(party({ email }), { requireAddress: false }).email).toBeUndefined();
    },
  );

  it.each(["kein-mail", "a@b.de,", "a@b..de", "a b@c.de", "@b.de", "a@", "a@-b.de", "a@b.de.", "a@@b.de", ".a@b.de x"])(
    "rejects the address %j",
    (email) => {
      expect(validateParty(party({ email }), { requireAddress: false }).email).toBeDefined();
    },
  );
});

describe("validateCatalogItem", () => {
  it("accepts name and a rate from 0 to 30", () => {
    for (const rate of [0, 7, 19, 30]) {
      expect(validateCatalogItem({ name: "Beratung", defaultVatRate: rate })).toEqual({});
    }
  });

  it("requires a name", () => {
    expect(validateCatalogItem({ name: " ", defaultVatRate: 19 }).name).toBeDefined();
  });

  it("rejects missing, fractional and out-of-range rates", () => {
    for (const rate of [null, Number.NaN, 7.5, -1, 31]) {
      expect(validateCatalogItem({ name: "x", defaultVatRate: rate }).defaultVatRate).toBeDefined();
    }
  });
});
