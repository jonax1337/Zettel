import { describe, expect, it } from "vitest";
import { customerAddressLines, senderLine } from "./address-lines";

const customer = {
  name: "Fahrradkontor Leipzig UG",
  contactPerson: "Mira Hansen",
  street: "Karl-Heine-Str. 88",
  postalCode: "04229",
  city: "Leipzig",
  country: "DE",
};

describe("customerAddressLines", () => {
  it("lists name, contact, street and place for a domestic customer", () => {
    expect(customerAddressLines(customer)).toEqual([
      "Fahrradkontor Leipzig UG",
      "Mira Hansen",
      "Karl-Heine-Str. 88",
      "04229 Leipzig",
    ]);
  });

  it("skips what is empty", () => {
    expect(customerAddressLines({ ...customer, contactPerson: null, street: "", postalCode: "" })).toEqual([
      "Fahrradkontor Leipzig UG",
      "Leipzig",
    ]);
  });

  it("names a foreign country", () => {
    expect(customerAddressLines({ ...customer, country: "at" }).at(-1)).toBe("Österreich");
  });
});

describe("senderLine", () => {
  it("joins company, street and place", () => {
    expect(senderLine({ companyName: "Musterstudio", street: "Beispielweg 1", postalCode: "10115", city: "Berlin" })).toBe(
      "Musterstudio, Beispielweg 1, 10115 Berlin",
    );
  });

  it("leaves out missing parts", () => {
    expect(senderLine({ companyName: "Musterstudio", street: "", postalCode: "", city: "" })).toBe("Musterstudio");
  });
});
