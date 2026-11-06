import { describe, expect, it } from "vitest";
import { missingXrechnungFields, type XrechnungSource } from "./preflight";

function completeSource(): XrechnungSource {
  return {
    invoice: { buyerReference: "04011000-1234512345-35" },
    company: {
      companyName: "Laux Digital GmbH",
      ownerName: "Jonas Laux",
      street: "Musterstr. 1",
      postalCode: "10115",
      city: "Berlin",
      phone: "+49 30 1234567",
      email: "rechnung@laux.digital",
      vatId: "DE123456789",
      taxNumber: "",
      bankIban: "DE89370400440532013000",
    },
    customer: {
      name: "Bundesamt für Beispielwesen",
      street: "Amtsplatz 1",
      postalCode: "53113",
      city: "Bonn",
      email: "eingangsrechnung@bfb.example.de",
    },
  };
}

function missingWith(change: (source: XrechnungSource) => void): string[] {
  const source = completeSource();
  change(source);
  return missingXrechnungFields(source);
}

describe("missingXrechnungFields", () => {
  it("reports nothing for complete data", () => {
    expect(missingXrechnungFields(completeSource())).toEqual([]);
  });

  it.each([null, "", "   "])("asks for the Leitweg-ID when the buyer reference is %j (BR-DE-15)", (value) => {
    expect(missingWith((s) => (s.invoice.buyerReference = value))).toEqual([
      "Leitweg-ID / Käuferreferenz der Rechnung",
    ]);
  });

  it("asks for the seller name", () => {
    expect(missingWith((s) => (s.company.companyName = " "))).toEqual(["Firmenname des Verkäufers"]);
  });

  it.each(["street", "postalCode", "city"] as const)("asks for the seller address when %s is empty (BR-DE-3/4)", (field) => {
    expect(missingWith((s) => (s.company[field] = ""))).toEqual(["Anschrift des Verkäufers"]);
  });

  it("asks for the seller contact person (BR-DE-2/5)", () => {
    expect(missingWith((s) => (s.company.ownerName = ""))).toEqual([
      "Ansprechpartner des Verkäufers (Inhaber:in)",
    ]);
  });

  it.each([null, "", "12", "tel."])("asks for a seller phone number with three digits, not %j (BR-DE-6/27)", (phone) => {
    expect(missingWith((s) => (s.company.phone = phone))).toEqual(["Telefonnummer des Verkäufers"]);
  });

  it("accepts a formatted phone number", () => {
    expect(missingWith((s) => (s.company.phone = "(030) 123 45"))).toEqual([]);
  });

  it.each(["", "kein-at-zeichen", "a@@b.de", "name @example.de", "@example.de"])(
    "asks for a valid seller e-mail, not %j (BR-DE-7/28)",
    (email) => {
      expect(missingWith((s) => (s.company.email = email))).toEqual(["E-Mail-Adresse des Verkäufers"]);
    },
  );

  it("accepts a tax number instead of a VAT ID (BR-DE-16)", () => {
    expect(
      missingWith((s) => {
        s.company.vatId = null;
        s.company.taxNumber = "12/345/67890";
      }),
    ).toEqual([]);
  });

  it("asks for a VAT ID or tax number when both are missing", () => {
    expect(
      missingWith((s) => {
        s.company.vatId = " ";
        s.company.taxNumber = "";
      }),
    ).toEqual(["USt-IdNr. oder Steuernummer des Verkäufers"]);
  });

  it("asks for the payment means when the seller has no IBAN (BR-DE-1)", () => {
    expect(missingWith((s) => (s.company.bankIban = ""))).toEqual(["Zahlungsweg (IBAN des Verkäufers)"]);
  });

  it.each(["street", "postalCode", "city"] as const)("asks for the customer address when %s is empty (BR-DE-8/9)", (field) => {
    expect(missingWith((s) => (s.customer[field] = ""))).toEqual(["Anschrift des Kunden"]);
  });

  it.each([null, "", "kein-at-zeichen"])("asks for the customer e-mail, not %j (BT-49)", (email) => {
    expect(missingWith((s) => (s.customer.email = email))).toEqual(["E-Mail-Adresse des Kunden"]);
  });

  it("lists everything at once, in invoice, seller, customer order", () => {
    const source = completeSource();
    source.invoice.buyerReference = null;
    source.company.phone = null;
    source.company.bankIban = "";
    source.customer.email = null;

    expect(missingXrechnungFields(source)).toEqual([
      "Leitweg-ID / Käuferreferenz der Rechnung",
      "Telefonnummer des Verkäufers",
      "Zahlungsweg (IBAN des Verkäufers)",
      "E-Mail-Adresse des Kunden",
    ]);
  });
});
