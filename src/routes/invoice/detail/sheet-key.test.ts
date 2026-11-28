import { describe, expect, it } from "vitest";
import { invoiceSheetKey, offerSheetKey } from "./sheet-key";

const invoice = {
  id: 1,
  number: "RE-2026-0001",
  status: "sent",
  total: 90_440,
  amountPaidCent: 0,
  notesInternal: null,
  followUpDate: null,
  lastValidationStatus: null,
  pdfPath: null,
  updatedAt: 1,
};
const items = [{ id: 1, description: "Pflege", quantity: 8, unitPrice: 9_500 }];

describe("invoiceSheetKey", () => {
  it("stays the same when only internal notes, validation or the PDF path changed", () => {
    const base = invoiceSheetKey(invoice, items);
    expect(invoiceSheetKey({ ...invoice, notesInternal: "angerufen", followUpDate: 5 }, items)).toBe(base);
    expect(invoiceSheetKey({ ...invoice, lastValidationStatus: "valid", pdfPath: "C:/a.pdf", updatedAt: 9 }, items)).toBe(base);
  });

  it.each([
    ["a payment", { amountPaidCent: 10_000 }],
    ["the status", { status: "paid" }],
    ["the number", { number: "RE-2026-0002" }],
    ["the total", { total: 1 }],
  ])("changes with %s", (_name, change) => {
    expect(invoiceSheetKey({ ...invoice, ...change }, items)).not.toBe(invoiceSheetKey(invoice, items));
  });

  it("changes with the items", () => {
    expect(invoiceSheetKey(invoice, [{ ...items[0], quantity: 9 }])).not.toBe(invoiceSheetKey(invoice, items));
  });
});

describe("offerSheetKey", () => {
  const offer = { id: 4, number: "AN-2026-0001", status: "draft", total: 1, pdfPath: null, updatedAt: 1 };

  it("ignores the PDF path", () => {
    expect(offerSheetKey({ ...offer, pdfPath: "C:/o.pdf", updatedAt: 3 }, items)).toBe(offerSheetKey(offer, items));
  });

  it("changes with the status", () => {
    expect(offerSheetKey({ ...offer, status: "sent" }, items)).not.toBe(offerSheetKey(offer, items));
  });
});
