import { describe, expect, it } from "vitest";
import { addressLines, contactFacts } from "./contact-facts";

const customer = {
  contactPerson: "Jonte Petersen",
  email: "buero@nordlicht.example",
  phone: "040 5550 123",
  street: "Fischmarkt 7",
  postalCode: "20359",
  city: "Hamburg",
  country: "DE",
  vatId: "DE123456789",
  leitwegId: "04011000-1234512345-35",
  receivesXrechnung: true,
};

describe("addressLines", () => {
  it("puts the street and the town on separate lines", () => {
    expect(addressLines(customer)).toEqual(["Fischmarkt 7", "20359 Hamburg"]);
  });

  it("adds the country name abroad", () => {
    expect(addressLines({ ...customer, country: "AT" })).toEqual(["Fischmarkt 7", "20359 Hamburg", "Österreich"]);
  });

  it("leaves out what is missing", () => {
    expect(addressLines({ ...customer, street: "", postalCode: "" })).toEqual(["Hamburg"]);
  });
});

describe("contactFacts", () => {
  it("lists every filled-in fact in a fixed order", () => {
    expect(contactFacts(customer).map((fact) => fact.label)).toEqual([
      "Ansprechpartner",
      "E-Mail",
      "Telefon",
      "Anschrift",
      "USt-IdNr.",
      "Leitweg-ID",
      "XRechnung",
    ]);
  });

  it("omits empty and blank facts", () => {
    const facts = contactFacts({ ...customer, contactPerson: null, phone: "  ", vatId: null, leitwegId: null, receivesXrechnung: false });

    expect(facts.map((fact) => fact.label)).toEqual(["E-Mail", "Anschrift"]);
  });

  it("returns nothing for a customer without any detail", () => {
    const bare = { ...customer, contactPerson: null, email: null, phone: null, street: "", postalCode: "", city: "", vatId: null, leitwegId: null, receivesXrechnung: false };

    expect(contactFacts(bare)).toEqual([]);
  });
});
