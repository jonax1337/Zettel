import { describe, expect, it } from "vitest";
import type { Settings } from "$lib/db/schema";
import { COMPANY_INCOMPLETE_CODE, companyIncompleteResponse } from "./company-guard";

const complete = {
  companyName: "Muster GmbH",
  street: "Hauptstr. 1",
  postalCode: "10115",
  city: "Berlin",
  taxNumber: "12/345/67890",
  vatId: null,
} as Settings;

describe("companyIncompleteResponse", () => {
  it("lets complete company data through", () => {
    expect(companyIncompleteResponse(complete)).toBeNull();
  });

  it("blocks with a German message naming what is missing", () => {
    const response = companyIncompleteResponse({ ...complete, companyName: "", taxNumber: "" });
    expect(response?.success).toBe(false);
    expect(response?.error.code).toBe(COMPANY_INCOMPLETE_CODE);
    expect(response?.error.message).toContain("Firmenname");
    expect(response?.error.message).toContain("Steuernummer oder USt-IdNr.");
    expect(response?.error.message).toContain("Einstellungen");
  });
});
