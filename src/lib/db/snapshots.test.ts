import { describe, expect, it, vi } from "vitest";

const { getCustomer, getVendor } = vi.hoisted(() => ({ getCustomer: vi.fn(), getVendor: vi.fn() }));
vi.mock("./queries", () => ({ getCustomer, getVendor }));

import { buildCustomerSnapshot, buildVendorSnapshot } from "./snapshots";

describe("buildCustomerSnapshot", () => {
  it("copies only the address fields, not ids or timestamps", async () => {
    getCustomer.mockResolvedValueOnce({
      id: 3,
      customerNumber: "K-0001",
      name: "Acme",
      contactPerson: "Erika",
      street: "Weg 1",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
      email: "a@b.de",
      phone: "123",
      vatId: "DE1",
      notes: "intern",
      createdAt: 1,
    });

    expect(await buildCustomerSnapshot(3)).toEqual({
      customerNumber: "K-0001",
      name: "Acme",
      contactPerson: "Erika",
      street: "Weg 1",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
      email: "a@b.de",
      vatId: "DE1",
    });
  });

  it("fails for an unknown customer", async () => {
    getCustomer.mockResolvedValueOnce(null);

    await expect(buildCustomerSnapshot(9)).rejects.toThrow("Customer 9 not found");
  });
});

describe("buildVendorSnapshot", () => {
  it("copies the vendor number and address fields", async () => {
    getVendor.mockResolvedValueOnce({
      vendorNumber: "L-0001",
      name: "Lieferant",
      contactPerson: null,
      street: "S",
      postalCode: "1",
      city: "C",
      country: "DE",
      email: null,
      vatId: null,
      bankIban: "geheim",
    });

    const snapshot = await buildVendorSnapshot(1);

    expect(snapshot).toMatchObject({ vendorNumber: "L-0001", name: "Lieferant" });
    expect(snapshot).not.toHaveProperty("bankIban");
  });

  it("fails for an unknown vendor", async () => {
    getVendor.mockResolvedValueOnce(null);

    await expect(buildVendorSnapshot(1)).rejects.toThrow("Vendor 1 not found");
  });
});
