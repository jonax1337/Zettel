import { describe, expect, it } from "vitest";
import { emptyPartyFields, partyFieldsFrom } from "./party-form";

describe("emptyPartyFields", () => {
  it("defaults to a German address with nullable contact data unset", () => {
    expect(emptyPartyFields()).toEqual({
      name: "",
      contactPerson: null,
      street: "",
      postalCode: "",
      city: "",
      country: "DE",
      email: null,
      phone: null,
      vatId: null,
      notes: null,
    });
  });

  it("returns a fresh object per call", () => {
    expect(emptyPartyFields()).not.toBe(emptyPartyFields());
  });
});

describe("partyFieldsFrom", () => {
  it("keeps only the shared fields of a larger record", () => {
    const vendor = {
      ...emptyPartyFields(),
      name: "Hosting GmbH",
      bankIban: "DE02120300000000202051",
      id: 7,
    };

    const fields = partyFieldsFrom(vendor);

    expect(fields.name).toBe("Hosting GmbH");
    expect(Object.keys(fields)).toHaveLength(10);
    expect(fields).not.toHaveProperty("bankIban");
    expect(fields).not.toHaveProperty("id");
  });
});
