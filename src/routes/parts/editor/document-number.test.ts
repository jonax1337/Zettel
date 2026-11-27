import { describe, expect, it } from "vitest";
import { assignedInvoiceNumber } from "./document-number";

describe("assignedInvoiceNumber", () => {
  it("returns a real number, e.g. of a reopened draft or a credit note", () => {
    expect(assignedInvoiceNumber("RE-2026-0012")).toBe("RE-2026-0012");
  });

  it("hides the draft placeholder", () => {
    expect(assignedInvoiceNumber("DRAFT-3496ea64e3304de7")).toBeNull();
  });

  it("is null for a document that was never stored", () => {
    expect(assignedInvoiceNumber(null)).toBeNull();
    expect(assignedInvoiceNumber("")).toBeNull();
  });
});
