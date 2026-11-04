import { beforeEach, describe, expect, it, vi } from "vitest";

const { select } = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("./client", () => ({ select }));

import { assertCustomerDeletable, assertVendorDeletable, deletionBlockedMessage } from "./references";

beforeEach(() => select.mockReset());

describe("deletionBlockedMessage", () => {
  const invoices = { one: "Rechnung", many: "Rechnungen" };
  const offers = { one: "Angebot", many: "Angebote" };

  it("allows deleting a record nothing points at", () => {
    expect(deletionBlockedMessage("Der Kunde", [{ ...invoices, count: 0 }])).toBeNull();
  });

  it("lists every kind of reference with singular or plural", () => {
    expect(
      deletionBlockedMessage("Der Kunde", [
        { ...invoices, count: 3 },
        { ...offers, count: 1 },
      ]),
    ).toBe("Der Kunde kann nicht gelöscht werden, es gibt noch 3 Rechnungen, 1 Angebot.");
  });
});

describe("assertCustomerDeletable", () => {
  it("counts invoices, offers and recurring templates of the customer", async () => {
    select.mockResolvedValueOnce([{ c0: 0, c1: 0, c2: 2 }]);

    await expect(assertCustomerDeletable(7)).rejects.toThrow("2 wiederkehrende Rechnungen");

    const [sql, binds] = select.mock.calls[0];
    expect(sql).toContain("FROM invoices WHERE customer_id = ?");
    expect(sql).toContain("FROM offers WHERE customer_id = ?");
    expect(sql).toContain("FROM recurring_invoices WHERE customer_id = ?");
    expect(binds).toEqual([7, 7, 7]);
  });

  it("passes for an unused customer", async () => {
    select.mockResolvedValueOnce([{ c0: 0, c1: 0, c2: 0 }]);

    await expect(assertCustomerDeletable(7)).resolves.toBeUndefined();
  });
});

describe("assertVendorDeletable", () => {
  it("refuses a vendor that still has expenses", async () => {
    select.mockResolvedValueOnce([{ c0: 1 }]);

    await expect(assertVendorDeletable(3)).rejects.toThrow("1 Eingangsrechnung.");
  });
});
