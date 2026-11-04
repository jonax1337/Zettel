import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("./client", () => ({ execute, insert: vi.fn(), select: vi.fn() }));
vi.mock("./invoices", () => ({ createInvoice: vi.fn() }));
vi.mock("./queries", () => ({ loadSettings: vi.fn(), getCustomer: vi.fn() }));

import { markSent, reopenDraft } from "./offers";

beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue({ rowsAffected: 1 });
});

describe("markSent", () => {
  it("records the given send date", async () => {
    await markSent(5, 1_700_000_000);

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("COALESCE(?, unixepoch())");
    expect(params).toEqual([1_700_000_000, 5]);
  });

  it("falls back to now when no send date is given", async () => {
    await markSent(5);

    expect(execute.mock.calls[0][1]).toEqual([null, 5]);
  });
});

describe("reopenDraft", () => {
  it("also reopens accepted offers, but only while they are not converted", async () => {
    await reopenDraft(5);

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("status = 'accepted' AND converted_invoice_id IS NULL");
    expect(params).toEqual([5]);
  });
});
