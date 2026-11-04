import { describe, expect, it } from "vitest";
import { SECONDS_PER_DAY } from "$lib/utils/date";
import { paidDateWarning, sendDateWarning } from "./date-warnings";

const DAY = SECONDS_PER_DAY;
const now = 1_800_000_000;

describe("sendDateWarning", () => {
  it("warns when sent before the invoice date", () => {
    expect(sendDateWarning(now - 2 * DAY, now - DAY, now)).toContain("vor dem Rechnungsdatum");
  });

  it("warns when sent more than a day in the future", () => {
    expect(sendDateWarning(now + 2 * DAY, now - DAY, now)).toContain("Zukunft");
  });

  it("accepts today and tomorrow (timezone slack)", () => {
    expect(sendDateWarning(now, now - DAY, now)).toBeNull();
    expect(sendDateWarning(now + DAY, now - DAY, now)).toBeNull();
  });
});

describe("paidDateWarning", () => {
  it("compares against the sent date when present", () => {
    const invoice = { sentAt: now - DAY, issueDate: now - 5 * DAY };
    expect(paidDateWarning(now - 2 * DAY, invoice, now)).toContain("vor dem Versand");
  });

  it("falls back to the issue date for invoices without sent date", () => {
    const invoice = { sentAt: null, issueDate: now - 5 * DAY };
    expect(paidDateWarning(now - 6 * DAY, invoice, now)).toContain("vor dem Versand");
    expect(paidDateWarning(now - 4 * DAY, invoice, now)).toBeNull();
  });

  it("warns for dates in the future", () => {
    const invoice = { sentAt: now - DAY, issueDate: now - 5 * DAY };
    expect(paidDateWarning(now + 3 * DAY, invoice, now)).toContain("Zukunft");
  });
});
