import { describe, expect, it } from "vitest";
import type { ExtractedInvoice, ExtractedText } from "$lib/sidecar/extract";
import type { PdfReadOutcome } from "./pdf-import";
import { vendorDraftFromOutcome } from "./vendor-draft";

const seller: ExtractedInvoice["seller"] = {
  name: "Acme GmbH",
  street: "Hauptstr. 1",
  postalCode: "10115",
  city: "Berlin",
  country: "at",
  vatId: "ATU12345678",
  taxNumber: null,
  email: "rechnung@acme.example",
};

function zugferd(partial: Partial<ExtractedInvoice["seller"]> = {}): PdfReadOutcome {
  return {
    kind: "zugferd",
    vendor: null,
    data: { seller: { ...seller, ...partial } } as ExtractedInvoice,
  };
}

function text(data: Partial<ExtractedText>): PdfReadOutcome {
  return { kind: "text", vendor: null, data: data as ExtractedText };
}

describe("vendorDraftFromOutcome", () => {
  it("prefills name, address, country and VAT id from the ZUGFeRD seller", () => {
    expect(vendorDraftFromOutcome(zugferd())).toMatchObject({
      name: "Acme GmbH",
      street: "Hauptstr. 1",
      postalCode: "10115",
      city: "Berlin",
      country: "AT",
      vatId: "ATU12345678",
      email: "rechnung@acme.example",
    });
  });

  it("defaults a missing or malformed country to DE and a missing name to empty", () => {
    expect(vendorDraftFromOutcome(zugferd({ country: "", name: null }))).toMatchObject({
      country: "DE",
      name: "",
    });
    expect(vendorDraftFromOutcome(zugferd({ country: "Germany" }))?.country).toBe("DE");
  });

  it("takes only the name and VAT id from text heuristics", () => {
    expect(vendorDraftFromOutcome(text({ vendorName: "Hosting AG", vendorVatId: "DE1" }))).toMatchObject({
      name: "Hosting AG",
      vatId: "DE1",
      street: "",
      country: "DE",
    });
  });

  it("offers nothing when the PDF told nothing about the vendor", () => {
    expect(vendorDraftFromOutcome(text({ vendorName: null, vendorVatId: null }))).toBeNull();
    expect(vendorDraftFromOutcome({ kind: "empty" })).toBeNull();
    expect(vendorDraftFromOutcome({ kind: "extract-failed", message: "x" })).toBeNull();
  });
});
