import { describe, expect, it } from "vitest";
import { ENTRY_STATUS, entryStatus } from "./entry-status";

describe("entryStatus", () => {
  it("is billed once the entry is on an invoice", () => {
    expect(entryStatus({ invoiceId: 3, durationMinutes: 60 })).toBe("billed");
    expect(ENTRY_STATUS.billed.variant).toBe("paid");
  });

  it("is running without a duration and not yet billed", () => {
    expect(entryStatus({ invoiceId: null, durationMinutes: null })).toBe("running");
  });

  it("is open for a finished entry on no invoice", () => {
    expect(entryStatus({ invoiceId: null, durationMinutes: 30 })).toBe("open");
    expect(ENTRY_STATUS.open.variant).toBe("open");
  });
});
