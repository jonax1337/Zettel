import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn<(sql: string, bindings?: unknown[]) => Promise<{ rowsAffected: number }>>(
    async () => ({ rowsAffected: 1 }),
  ),
  insert: vi.fn(),
}));

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...db,
}));

const { changedNumberCounters, saveLastAutoBackupAt, saveNumberCounters, saveSettings } =
  await import("./queries");

const COUNTERS = {
  invoiceNumberCounter: 4,
  offerNumberCounter: 2,
  vendorNumberCounter: 1,
  expenseNumberCounter: 9,
  reminderNumberCounter: 0,
};

function lastSql(): string {
  return String(db.execute.mock.calls.at(-1)?.[0]);
}

describe("settings writes", () => {
  beforeEach(() => db.execute.mockClear());

  it("saveSettings leaves the number counters and the auto-backup stamp alone", async () => {
    await saveSettings({ ...COUNTERS, companyName: "Acme", lastAutoBackupAt: 123 });

    expect(lastSql()).toContain("company_name = ?");
    expect(lastSql()).not.toContain("_number_counter");
    expect(lastSql()).not.toContain("last_auto_backup_at");
  });

  it("saveSettings stores a blank mail template as NULL and keeps a filled one", async () => {
    await saveSettings({
      mailInvoiceSubject: "  ",
      mailInvoiceBody: "Hallo {kunde},\n{nummer}",
      mailOfferSubject: null,
    });

    const assignments = lastSql().replace(/^UPDATE settings SET /, "").split(", ");
    const bindings = db.execute.mock.calls.at(-1)![1]!;
    const bound = (column: string) =>
      bindings[assignments.findIndex((assignment) => assignment.startsWith(`${column} =`))];
    expect(bound("mail_invoice_subject")).toBeNull();
    expect(bound("mail_invoice_body")).toBe("Hallo {kunde},\n{nummer}");
    expect(bound("mail_offer_subject")).toBeNull();
  });

  it("saveLastAutoBackupAt updates only the stamp", async () => {
    await saveLastAutoBackupAt(1_700_000_000);

    expect(db.execute).toHaveBeenCalledWith(
      "UPDATE settings SET last_auto_backup_at = ? WHERE id = 1",
      [1_700_000_000],
    );
  });

  it("saveNumberCounters writes exactly the counters it is given", async () => {
    await saveNumberCounters({ invoiceNumberCounter: 10 });

    expect(lastSql()).toBe(
      "UPDATE settings SET invoice_number_counter = ?, updated_at = unixepoch() WHERE id = 1",
    );
    expect(db.execute.mock.calls.at(-1)?.[1]).toEqual([10]);
  });

  it("saveNumberCounters without changes does not touch the database", async () => {
    await saveNumberCounters({});

    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe("changedNumberCounters", () => {
  it("returns only the counters that were edited", () => {
    expect(changedNumberCounters(COUNTERS, { ...COUNTERS, offerNumberCounter: 7 })).toEqual({
      offerNumberCounter: 7,
    });
  });

  it("is empty when nothing changed", () => {
    expect(changedNumberCounters(COUNTERS, { ...COUNTERS })).toEqual({});
  });
});
