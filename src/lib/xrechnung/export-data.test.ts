import { describe, expect, it } from "vitest";
import type { CustomerSnapshot } from "$lib/db/schema";
import { withLiveCustomerFallbacks } from "./export-data";

const snapshot: CustomerSnapshot = {
  customerNumber: "K-0001",
  name: "Bundesamt",
  contactPerson: null,
  street: "Amtsplatz 1",
  postalCode: "53113",
  city: "Bonn",
  country: "DE",
  email: null,
  vatId: null,
};

describe("withLiveCustomerFallbacks", () => {
  it("takes the Leitweg-ID and e-mail the customer gained after the invoice was issued", () => {
    const result = withLiveCustomerFallbacks(null, snapshot, { leitwegId: " 04011000-1234512345-35 ", email: "amt@bfb.de" });

    expect(result.buyerReference).toBe("04011000-1234512345-35");
    expect(result.customer.email).toBe("amt@bfb.de");
  });

  it("keeps what the issued invoice and its snapshot carry", () => {
    const frozen = { ...snapshot, email: "alt@bfb.de" };

    const result = withLiveCustomerFallbacks("A-1", frozen, { leitwegId: "B-2", email: "neu@bfb.de" });

    expect(result.buyerReference).toBe("A-1");
    expect(result.customer).toBe(frozen);
  });

  it("falls back for blank values too", () => {
    const result = withLiveCustomerFallbacks("  ", { ...snapshot, email: " " }, { leitwegId: "B-2", email: "neu@bfb.de" });

    expect(result).toMatchObject({ buyerReference: "B-2", customer: { email: "neu@bfb.de" } });
  });

  it("does not touch the snapshot it was given", () => {
    const original = { ...snapshot };
    withLiveCustomerFallbacks(null, snapshot, { leitwegId: "B-2", email: "neu@bfb.de" });

    expect(snapshot).toEqual(original);
  });

  it("stays empty when the live customer has nothing either", () => {
    expect(withLiveCustomerFallbacks(null, snapshot, null)).toEqual({ buyerReference: null, customer: snapshot });
    expect(withLiveCustomerFallbacks(null, snapshot, { leitwegId: null, email: null })).toEqual({
      buyerReference: null,
      customer: snapshot,
    });
  });
});
