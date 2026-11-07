import { describe, expect, it } from "vitest";
import { buildSetupChecklist, isSetupComplete } from "./setup-checklist";

describe("setup checklist", () => {
  it("starts with every step open on an empty database", () => {
    const steps = buildSetupChecklist({
      missingCompany: ["Firmenname"],
      customerCount: 0,
      hasInvoices: false,
    });
    expect(steps.map((s) => [s.id, s.done])).toEqual([
      ["company", false],
      ["customer", false],
      ["invoice", false],
    ]);
    expect(isSetupComplete(steps)).toBe(false);
  });

  it("links each step to where it is done", () => {
    const hrefs = buildSetupChecklist({ missingCompany: [], customerCount: 0, hasInvoices: false });
    expect(hrefs.map((s) => s.href)).toEqual(["/settings/company", "/customers/new", "/invoices/new"]);
  });

  it("ticks steps off as data appears", () => {
    const steps = buildSetupChecklist({ missingCompany: [], customerCount: 2, hasInvoices: false });
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["company", "customer"]);
  });

  it("is complete once company, customer and invoice exist", () => {
    const steps = buildSetupChecklist({ missingCompany: [], customerCount: 1, hasInvoices: true });
    expect(isSetupComplete(steps)).toBe(true);
  });
});
