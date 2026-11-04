import { describe, expect, it } from "vitest";
import type { Settings } from "$lib/db/schema";
import { applyDraft, COMPANY_STEP, emptyDraft, TAX_STEP, validateStep } from "./onboarding-draft";

const filledCompany = {
  ...emptyDraft(),
  companyName: "Muster GmbH",
  street: "Hauptstr. 1",
  postalCode: "10115",
  city: "Berlin",
};

describe("validateStep", () => {
  it("requires company name, street, postal code and city on the company step", () => {
    expect(validateStep(COMPANY_STEP, emptyDraft())).not.toBeNull();
    expect(validateStep(COMPANY_STEP, { ...filledCompany, city: "  " })).not.toBeNull();
    expect(validateStep(COMPANY_STEP, filledCompany)).toBeNull();
  });

  it("requires a tax number or a VAT id on the tax step (BR-CO-26)", () => {
    expect(validateStep(TAX_STEP, filledCompany)).toMatch(/BR-CO-26/);
    expect(validateStep(TAX_STEP, { ...filledCompany, taxNumber: "12/345/67890" })).toBeNull();
    expect(validateStep(TAX_STEP, { ...filledCompany, vatId: "DE123456789" })).toBeNull();
  });

  it("does not block the bank and summary steps", () => {
    expect(validateStep(3, emptyDraft())).toBeNull();
    expect(validateStep(4, emptyDraft())).toBeNull();
  });
});

describe("applyDraft", () => {
  const current = { companyName: "", pdfTheme: "modern" } as Settings;

  it("trims values and keeps settings the wizard does not own", () => {
    const result = applyDraft(current, { ...filledCompany, companyName: "  Muster GmbH " });
    expect(result.companyName).toBe("Muster GmbH");
    expect(result.pdfTheme).toBe("modern");
  });

  it("stores an empty VAT id as null", () => {
    expect(applyDraft(current, { ...filledCompany, vatId: "  " }).vatId).toBeNull();
    expect(applyDraft(current, { ...filledCompany, vatId: " DE1 " }).vatId).toBe("DE1");
  });

  it("normalises the country to an upper-case two-letter code and defaults to DE", () => {
    expect(applyDraft(current, { ...filledCompany, country: "at" }).country).toBe("AT");
    expect(applyDraft(current, { ...filledCompany, country: "deu" }).country).toBe("DE");
    expect(applyDraft(current, { ...filledCompany, country: " " }).country).toBe("DE");
  });
});
