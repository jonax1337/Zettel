import { describe, expect, it } from "vitest";
import { companyIncompleteMessage, missingCompanyData } from "./company-completeness";

const complete = {
  companyName: "Muster GmbH",
  street: "Hauptstr. 1",
  postalCode: "10115",
  city: "Berlin",
  taxNumber: "12/345/67890",
  vatId: null,
};

describe("missingCompanyData", () => {
  it("reports nothing for complete company data", () => {
    expect(missingCompanyData(complete)).toEqual([]);
  });

  it("accepts a VAT ID instead of a tax number", () => {
    expect(missingCompanyData({ ...complete, taxNumber: "", vatId: "DE123456789" })).toEqual([]);
  });

  it("requires a tax number or a VAT ID", () => {
    expect(missingCompanyData({ ...complete, taxNumber: "  ", vatId: " " })).toEqual([
      "Steuernummer oder USt-IdNr.",
    ]);
  });

  it("requires name and the full address", () => {
    expect(missingCompanyData({ ...complete, companyName: "", city: "" })).toEqual([
      "Firmenname",
      "Anschrift",
    ]);
  });

  it("flags a fresh installation as missing everything", () => {
    const fresh = { companyName: "", street: "", postalCode: "", city: "", taxNumber: "", vatId: null };
    expect(missingCompanyData(fresh)).toHaveLength(3);
  });
});

describe("companyIncompleteMessage", () => {
  it("names the missing fields", () => {
    expect(companyIncompleteMessage(["Firmenname", "Anschrift"])).toContain("Firmenname, Anschrift");
  });
});
