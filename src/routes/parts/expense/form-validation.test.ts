import { describe, expect, it } from "vitest";
import { emptyItemRow } from "./expense-form";
import { hasErrors, validateExpenseForm } from "./form-validation";

const valid = () => ({
  vendorId: "3",
  issueDateIso: "2026-11-27",
  items: [emptyItemRow({ description: "Hosting" })],
});

describe("validateExpenseForm", () => {
  it("accepts a complete form", () => {
    expect(hasErrors(validateExpenseForm(valid()))).toBe(false);
  });

  it("asks for the vendor and the date in the du form", () => {
    const errors = validateExpenseForm({ ...valid(), vendorId: "", issueDateIso: "" });
    expect(errors.vendor).toBe("Wähle einen Lieferanten aus.");
    expect(errors.issueDate).toBe("Trage das Rechnungsdatum ein.");
  });

  it("names the first position without a description and lists every one", () => {
    const form = valid();
    form.items.push(emptyItemRow({ description: "  " }), emptyItemRow());
    const errors = validateExpenseForm(form);
    expect(errors.items).toBe("Beschreibe Position 2.");
    expect(errors.descriptionRows).toEqual([1, 2]);
  });

  it("asks for a cleared quantity in the du form", () => {
    const form = valid();
    form.items[0].quantity = Number.NaN;
    const errors = validateExpenseForm(form);
    expect(errors.items).toBe("Trage bei Position 1 eine Menge ein.");
    expect(errors.quantityRows).toEqual([0]);
  });
});
