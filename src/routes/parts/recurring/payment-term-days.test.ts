import { describe, expect, it } from "vitest";
import { fromIsoDate } from "$lib/utils/date";
import { paymentTermDays } from "./payment-term-days";

describe("paymentTermDays", () => {
  const issue = fromIsoDate("2026-03-01");

  it("returns the whole days between issue and due date", () => {
    expect(paymentTermDays(issue, fromIsoDate("2026-03-15"), 7)).toBe(14);
  });

  it("falls back when due on the issue day or earlier", () => {
    expect(paymentTermDays(issue, issue, 7)).toBe(7);
    expect(paymentTermDays(issue, fromIsoDate("2026-02-20"), 7)).toBe(7);
  });
});
