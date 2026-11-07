import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ execute: vi.fn(), insert: vi.fn(), select: vi.fn() }));
vi.mock("./client", () => db);

import {
  addPayment,
  DuplicateBankBookingError,
  paymentRejection,
  statusForPaidAmount,
  type PayableInvoice,
} from "./invoice-payments";

describe("statusForPaidAmount", () => {
  it("stays 'sent' while nothing (or a net refund) has been paid", () => {
    expect(statusForPaidAmount(0, 10_000)).toBe("sent");
    expect(statusForPaidAmount(-500, 10_000)).toBe("sent");
  });

  it("is 'partial' while the paid amount is below the total", () => {
    expect(statusForPaidAmount(1, 10_000)).toBe("partial");
    expect(statusForPaidAmount(9_999, 10_000)).toBe("partial");
  });

  it("is 'paid' once the total is reached or exceeded", () => {
    expect(statusForPaidAmount(10_000, 10_000)).toBe("paid");
    expect(statusForPaidAmount(10_001, 10_000)).toBe("paid");
  });
});

describe("paymentRejection", () => {
  const open: PayableInvoice = { status: "partial", total: 10_000, amountPaidCent: 4_000, creditedCent: 0 };

  it.each(["sent", "partial"] as const)("accepts a payment on a %s invoice", (status) => {
    expect(paymentRejection({ ...open, status }, 1_000)).toBeNull();
  });

  it.each(["draft", "paid", "cancelled"] as const)("rejects a payment on a %s invoice", (status) => {
    expect(paymentRejection({ ...open, status }, 1_000)).toContain("versendete oder teilbezahlte");
  });

  it.each([0, -100, 0.5])("rejects the amount %s", (amount) => {
    expect(paymentRejection(open, amount)).toContain("größer als 0");
  });

  it("accepts the open amount plus the rounding cent bank matching tolerates, but no more", () => {
    expect(paymentRejection(open, 6_000)).toBeNull();
    expect(paymentRejection(open, 6_001)).toBeNull();
    expect(paymentRejection(open, 6_002)).toContain("übersteigt");
  });

  it("accepts an overpayment when it is explicitly allowed", () => {
    expect(paymentRejection(open, 6_002, true)).toBeNull();
  });

  it("measures the open amount of a credit note by its absolute total", () => {
    expect(paymentRejection({ ...open, status: "sent", total: -10_000, amountPaidCent: 0 }, 10_000)).toBeNull();
  });

  it.each(["sent", "partial"] as const)("rejects a payment on a %s invoice an issued credit note offsets", (status) => {
    expect(paymentRejection({ ...open, status, amountPaidCent: 0, creditedCent: 10_000 }, 1_000)).toContain(
      "Stornorechnung",
    );
  });

  describe("on a partially credited invoice (119,00 total, 50,00 paid, 30,00 credited -> 39,00 open)", () => {
    const partlyCredited: PayableInvoice = { status: "partial", total: 11_900, amountPaidCent: 5_000, creditedCent: 3_000 };

    it("accepts the open remainder", () => {
      expect(paymentRejection(partlyCredited, 3_900)).toBeNull();
    });

    it("rejects more than the remainder as an overpayment, not as settled", () => {
      expect(paymentRejection(partlyCredited, 4_000)).toContain("übersteigt");
    });
  });

  it("rejects payments once payments and a partial credit note cover the total", () => {
    expect(paymentRejection({ status: "partial", total: 11_900, amountPaidCent: 8_900, creditedCent: 3_000 }, 100)).toContain(
      "Stornorechnung",
    );
  });
});

describe("addPayment", () => {
  const payable = { status: "sent", total: 10_000, paid_cent: 0, credited_cent: 0 };
  const payment = { invoiceId: 7, paidAt: 1_750_000_000, amountCent: 4_000 };

  function invoiceInDb(invoice: object | null, opts: { bookingRecorded?: boolean } = {}) {
    db.select.mockImplementation(async (sql: string) => {
      if (sql.includes("bank_transaction_id = ?")) return opts.bookingRecorded ? [{ id: 1 }] : [];
      if (sql.includes("MAX(paid_at)")) return [{ paid_cent: 4_000, last_paid_at: 1_750_000_000 }];
      return invoice ? [invoice] : [];
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    db.insert.mockResolvedValue(55);
    db.execute.mockResolvedValue({ rowsAffected: 1 });
  });

  it("records the payment and marks the invoice partially paid", async () => {
    invoiceInDb(payable);

    expect(await addPayment(payment)).toBe(55);

    const statusUpdate = db.execute.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE invoices"))!;
    expect(statusUpdate[1]).toEqual(["partial", 4_000, null, 7]);
  });

  it("validates before writing anything", async () => {
    invoiceInDb({ ...payable, status: "paid" });

    await expect(addPayment(payment)).rejects.toThrow("versendete oder teilbezahlte");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("refuses a payment on an invoice an issued credit note offsets", async () => {
    invoiceInDb({ ...payable, credited_cent: 10_000 });

    await expect(addPayment(payment)).rejects.toThrow("Stornorechnung");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("marks the invoice paid once the payment covers what a partial credit note leaves open", async () => {
    invoiceInDb({ ...payable, credited_cent: 6_000 });

    await addPayment(payment);

    const statusUpdate = db.execute.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE invoices"))!;
    expect(statusUpdate[1]).toEqual(["paid", 4_000, 1_750_000_000, 7]);
  });

  it("removes the payment again when the invoice status cannot be updated", async () => {
    invoiceInDb(payable);
    db.execute.mockRejectedValueOnce(new Error("CHECK constraint failed: status"));

    await expect(addPayment(payment)).rejects.toThrow("CHECK constraint failed");

    expect(db.execute.mock.calls.at(-1)).toEqual(["DELETE FROM invoice_payments WHERE id = ?", [55]]);
  });

  it("refuses a bank booking that an earlier import already recorded", async () => {
    invoiceInDb(payable, { bookingRecorded: true });

    await expect(addPayment({ ...payment, bankTransactionId: "2026-03-05|4000|EUR|ref:T1" })).rejects.toBeInstanceOf(
      DuplicateBankBookingError,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("reports a booking recorded concurrently as a duplicate, not as a raw SQL error", async () => {
    invoiceInDb(payable);
    db.insert.mockRejectedValueOnce(
      new Error("error returned from database: (code: 2067) UNIQUE constraint failed: invoice_payments.bank_transaction_id"),
    );

    await expect(addPayment({ ...payment, bankTransactionId: "key-1" })).rejects.toBeInstanceOf(
      DuplicateBankBookingError,
    );
  });

  it("passes other insert failures through unchanged", async () => {
    invoiceInDb(payable);
    db.insert.mockRejectedValueOnce(new Error("FOREIGN KEY constraint failed"));

    await expect(addPayment({ ...payment, bankTransactionId: "key-1" })).rejects.toThrow("FOREIGN KEY");
  });

  it("stores the dedupe key of an imported booking", async () => {
    invoiceInDb(payable);

    await addPayment({ ...payment, source: "camt053", bankTransactionId: "key-1" });

    const [, binds] = db.insert.mock.calls[0];
    expect(binds.at(-1)).toBe("key-1");
  });

  it("fails with a clear message for an unknown invoice", async () => {
    invoiceInDb(null);

    await expect(addPayment(payment)).rejects.toThrow("Rechnung 7 nicht gefunden");
  });
});
