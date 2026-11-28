import { describe, expect, it } from "vitest";
import type { Customer } from "$lib/db/schema";
import { withFigures } from "./customer-list";

const customer = (id: number) => ({ id, name: `Kunde ${id}` }) as Customer;

describe("withFigures", () => {
  it("adds the customer's figures and gives a customer without invoices empty ones", () => {
    const figures = new Map([[1, { revenueNet: 5_000, openBalance: 1_190, openCount: 1, lastInvoiceDate: 1_760_000_000 }]]);

    const [withInvoices, without] = withFigures([customer(1), customer(2)], figures);

    expect(withInvoices).toMatchObject({ id: 1, revenueNet: 5_000, openBalance: 1_190, lastInvoiceDate: 1_760_000_000 });
    expect(without).toMatchObject({ id: 2, revenueNet: 0, openBalance: 0, openCount: 0, lastInvoiceDate: null });
  });
});
