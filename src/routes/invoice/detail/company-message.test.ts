import { describe, expect, it } from "vitest";
import { companyIncompleteMessage, companySettingsRoute } from "$lib/utils/company-completeness";
import { missingFromCompanyMessage } from "./company-message";

describe("missingFromCompanyMessage", () => {
  it.each([
    [["Firmenname"]],
    [["Anschrift", "Firmenname"]],
    [["Steuernummer oder USt-IdNr."]],
    [["Firmenname", "Anschrift", "Steuernummer oder USt-IdNr."]],
  ])("reads back what companyIncompleteMessage wrote: %j", (missing) => {
    expect(missingFromCompanyMessage(companyIncompleteMessage(missing))).toEqual(missing);
  });

  it("leads to the tax page when only the tax identification is missing", () => {
    const missing = missingFromCompanyMessage(companyIncompleteMessage(["Steuernummer oder USt-IdNr."]));
    expect(companySettingsRoute(missing)).toBe("/settings/tax");
  });

  it("leads to the company page when more is missing", () => {
    const missing = missingFromCompanyMessage(companyIncompleteMessage(["Firmenname", "Steuernummer oder USt-IdNr."]));
    expect(companySettingsRoute(missing)).toBe("/settings/company");
  });

  it("finds nothing in an unrelated message", () => {
    expect(missingFromCompanyMessage("Etwas anderes")).toEqual([]);
  });
});
