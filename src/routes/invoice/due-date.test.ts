import { describe, expect, it } from "vitest";
import { dueDateFromIssue, followDerivedDueDate } from "./due-date";

describe("dueDateFromIssue", () => {
  it("adds the payment terms days to the issue date", () => {
    expect(dueDateFromIssue("2026-03-01", 14)).toBe("2026-03-15");
    expect(dueDateFromIssue("2026-03-01", 30)).toBe("2026-03-31");
  });

  it("rolls over month and year boundaries", () => {
    expect(dueDateFromIssue("2026-12-20", 14)).toBe("2027-01-03");
  });

  it("supports a payment term of zero days", () => {
    expect(dueDateFromIssue("2026-03-01", 0)).toBe("2026-03-01");
  });

  it("returns an empty string while the issue date is empty", () => {
    expect(dueDateFromIssue("", 14)).toBe("");
  });
});

describe("followDerivedDueDate", () => {
  it("moves a due date that still equals the derived default", () => {
    expect(followDerivedDueDate("2026-03-15", "2026-03-15", "2026-04-01")).toBe("2026-04-01");
  });

  it("fills an empty due date when nothing was derived yet", () => {
    expect(followDerivedDueDate("", "", "2026-03-15")).toBe("2026-03-15");
  });

  it("keeps a due date the user changed manually", () => {
    expect(followDerivedDueDate("2026-05-05", "2026-03-15", "2026-04-01")).toBe("2026-05-05");
  });
});
