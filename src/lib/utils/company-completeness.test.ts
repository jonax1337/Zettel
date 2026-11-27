import { describe, expect, it } from "vitest";
import {
  COMPANY_SETTINGS_ROUTE,
  TAX_SETTINGS_ROUTE,
  companyIncompleteMessage,
  companySettingsRoute,
  missingCompanyData,
} from "./company-completeness";

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

  it("points to the settings page by its UI name", () => {
    expect(companyIncompleteMessage(["Anschrift"])).toContain("Einstellungen → Unternehmen");
  });

  it("points to Steuern when only the tax identification is missing", () => {
    expect(companyIncompleteMessage(["Steuernummer oder USt-IdNr."])).toContain("Einstellungen → Steuern");
  });

  it("names both pages when the tax identification and something else are missing", () => {
    expect(companyIncompleteMessage(["Firmenname", "Steuernummer oder USt-IdNr."])).toContain(
      "Einstellungen → Unternehmen und Steuern",
    );
  });
});

describe("companySettingsRoute", () => {
  it("opens the tax page when only the tax identification is missing", () => {
    expect(companySettingsRoute(missingCompanyData({ ...complete, taxNumber: "", vatId: null }))).toBe(
      TAX_SETTINGS_ROUTE,
    );
  });

  it("opens the company page when the name or address is missing", () => {
    expect(companySettingsRoute(missingCompanyData({ ...complete, city: "" }))).toBe(COMPANY_SETTINGS_ROUTE);
  });

  it("opens the company page when the tax identification is missing along with other data", () => {
    const fresh = { companyName: "", street: "", postalCode: "", city: "", taxNumber: "", vatId: null };
    expect(companySettingsRoute(missingCompanyData(fresh))).toBe(COMPANY_SETTINGS_ROUTE);
  });

  it("falls back to the company page when nothing is missing", () => {
    expect(companySettingsRoute([])).toBe(COMPANY_SETTINGS_ROUTE);
  });
});

describe("the list of missing data inside a sentence", () => {
  it("ends with one period even when the last label has its own", () => {
    const message = companyIncompleteMessage(["Anschrift", "Steuernummer oder USt-IdNr."]);
    expect(message).toContain("Steuernummer oder USt-IdNr. Bitte");
    expect(message).not.toContain("..");
  });
});
