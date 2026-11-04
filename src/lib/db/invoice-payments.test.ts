import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ execute: vi.fn(), insert: vi.fn(), select: vi.fn() }));

import { statusForPaidAmount } from "./invoice-payments";

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
