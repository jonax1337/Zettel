import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, select } = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn() }));
vi.mock("./client", () => ({ execute, select }));
vi.mock("./queries", () => ({
  SETTINGS_DEFAULTS: {
    invoiceNumberFormat: "RE-{YYYY}-{NNNN}",
    offerNumberFormat: "AN-{YYYY}-{NNNN}",
    expenseNumberFormat: "EX-{YYYY}-{NNNN}",
    reminderNumberFormat: "MA-{YYYY}-{NNNN}",
  },
}));

import { drawNextNumber, type NumberSequence } from "./numbering";

const DOCUMENT_DATE = Math.floor(new Date(2024, 2, 15, 12).getTime() / 1000);
const NEW_YEAR_2025 = Math.floor(new Date(2025, 0, 1, 0, 0, 0).getTime() / 1000);

beforeEach(() => {
  execute.mockReset();
  select.mockReset();
});

describe("drawNextNumber", () => {
  it.each<[NumberSequence, string, string]>([
    ["invoice", "invoice_number_counter", "invoice_number_format"],
    ["offer", "offer_number_counter", "offer_number_format"],
    ["expense", "expense_number_counter", "expense_number_format"],
    ["reminder", "reminder_number_counter", "reminder_number_format"],
  ])("bumps and reads the %s counter and format columns", async (sequence, counter, format) => {
    select.mockResolvedValueOnce([{ counter: 7, format: "X-{NNNN}" }]);

    expect(await drawNextNumber(sequence, DOCUMENT_DATE)).toBe("X-0007");

    expect(execute.mock.calls[0][0]).toContain(`SET ${counter} = ${counter} + 1`);
    expect(select.mock.calls[0][0]).toContain(`SELECT ${counter} AS counter, ${format} AS format`);
  });

  it("increments before reading, so the drawn number is the new counter value", async () => {
    const order: string[] = [];
    execute.mockImplementation(async () => void order.push("update"));
    select.mockImplementation(async () => {
      order.push("select");
      return [{ counter: 1, format: "RE-{NNNN}" }];
    });

    await drawNextNumber("invoice", DOCUMENT_DATE);

    expect(order).toEqual(["update", "select"]);
  });

  it.each<[NumberSequence, string]>([
    ["invoice", `RE-2024-0001`],
    ["offer", `AN-2024-0001`],
    ["expense", `EX-2024-0001`],
    ["reminder", `MA-2024-0001`],
  ])("falls back to the default %s format and counter 1 when the settings values are unset", async (sequence, expected) => {
    select.mockResolvedValueOnce([{ counter: null, format: null }]);

    expect(await drawNextNumber(sequence, DOCUMENT_DATE)).toBe(expected);
  });

  it("takes year and month from the document date instead of today", async () => {
    select.mockResolvedValueOnce([{ counter: 3, format: "RE-{YYYY}{MM}-{NNNN}" }]);

    expect(await drawNextNumber("invoice", DOCUMENT_DATE)).toBe("RE-202403-0003");
  });

  it("switches year exactly at local midnight of 1 January", async () => {
    select.mockResolvedValue([{ counter: 1, format: "RE-{YYYY}-{NNNN}" }]);

    expect(await drawNextNumber("invoice", NEW_YEAR_2025 - 1)).toBe("RE-2024-0001");
    expect(await drawNextNumber("invoice", NEW_YEAR_2025)).toBe("RE-2025-0001");
  });

  it("leaves formats without date placeholders unchanged", async () => {
    select.mockResolvedValueOnce([{ counter: 5, format: "K-{NNNN}" }]);

    expect(await drawNextNumber("invoice", DOCUMENT_DATE)).toBe("K-0005");
  });
});
