import { describe, expect, it } from "vitest";
import {
  findVendorByName,
  findVendorByNameLoosely,
  findVendorByVatId,
  vendorFileSlug,
} from "./vendor-match";

const acme = { name: "Acme GmbH", vatId: "DE 123 456 789", vendorNumber: "L-0001" };
const hosting = { name: "Hosting AG", vatId: null, vendorNumber: "L-0002" };
const vendors = [acme, hosting];

describe("findVendorByVatId", () => {
  it("ignores spaces and case", () => {
    expect(findVendorByVatId(vendors, "de123456789")).toBe(acme);
  });

  it("returns null without a VAT id or without a match", () => {
    expect(findVendorByVatId(vendors, null)).toBeNull();
    expect(findVendorByVatId(vendors, "")).toBeNull();
    expect(findVendorByVatId(vendors, "DE999999999")).toBeNull();
  });
});

describe("findVendorByName", () => {
  it("matches the whole name regardless of case and surrounding spaces", () => {
    expect(findVendorByName(vendors, "  acme gmbh ")).toBe(acme);
  });

  it("does not match a partial name", () => {
    expect(findVendorByName(vendors, "Acme")).toBeNull();
  });

  it("returns null for blank input", () => {
    expect(findVendorByName(vendors, null)).toBeNull();
    expect(findVendorByName(vendors, "   ")).toBeNull();
  });
});

describe("findVendorByNameLoosely", () => {
  it("falls back to a contained name in either direction", () => {
    expect(findVendorByNameLoosely(vendors, "Acme")).toBe(acme);
    expect(findVendorByNameLoosely(vendors, "Rechnung von Hosting AG, Berlin")).toBe(hosting);
  });

  it("prefers the exact match over a partial one", () => {
    const longer = { name: "Acme GmbH & Co. KG", vatId: null };
    expect(findVendorByNameLoosely([longer, acme], "Acme GmbH")).toBe(acme);
  });

  it("does not match everything for blank text", () => {
    expect(findVendorByNameLoosely(vendors, "   ")).toBeNull();
    expect(findVendorByNameLoosely(vendors, null)).toBeNull();
  });

  it("ignores vendors with an empty name", () => {
    const nameless = { name: "", vatId: null };
    expect(findVendorByNameLoosely([nameless], "Irgendwer")).toBeNull();
  });
});

describe("vendorFileSlug", () => {
  it("builds a lowercase folder-safe slug from number and name", () => {
    expect(vendorFileSlug(acme)).toBe("l-0001-acme-gmbh");
  });

  it("trims dashes and caps the length", () => {
    const slug = vendorFileSlug({ vendorNumber: "L-1", name: `${"x".repeat(80)}!` });
    expect(slug).toHaveLength(60);
    expect(slug?.endsWith("-")).toBe(false);
  });

  it("is undefined without a vendor", () => {
    expect(vendorFileSlug(null)).toBeUndefined();
  });
});
