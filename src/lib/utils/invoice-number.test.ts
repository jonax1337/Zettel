import { describe, it, expect } from "vitest";
import { displayInvoiceNumber, draftPlaceholder, formatInvoiceNumber, isDraftNumber } from "./invoice-number";

const D = new Date(2026, 4, 17); // May 17, 2026

describe("formatInvoiceNumber", () => {
  it("renders the default invoice pattern", () => {
    expect(formatInvoiceNumber("RE-{YYYY}-{NNNN}", 1, D)).toBe("RE-2026-0001");
  });

  it("renders the default customer pattern", () => {
    expect(formatInvoiceNumber("K-{NNNN}", 42, D)).toBe("K-0042");
  });

  it("renders the default vendor pattern", () => {
    expect(formatInvoiceNumber("L-{NNNN}", 7, D)).toBe("L-0007");
  });

  it("renders all document-type prefixes consistently", () => {
    expect(formatInvoiceNumber("AN-{YYYY}-{NNNN}", 12, D)).toBe("AN-2026-0012");
    expect(formatInvoiceNumber("EX-{YYYY}-{NNNN}", 12, D)).toBe("EX-2026-0012");
    expect(formatInvoiceNumber("MA-{YYYY}-{NNNN}", 12, D)).toBe("MA-2026-0012");
  });

  it("handles YY (two-digit year)", () => {
    expect(formatInvoiceNumber("RE-{YY}-{NNNN}", 1, D)).toBe("RE-26-0001");
  });

  it("handles MM (zero-padded month)", () => {
    expect(formatInvoiceNumber("RE-{YYYY}{MM}-{NNNN}", 1, D)).toBe("RE-202605-0001");
  });

  it("handles N (no padding)", () => {
    expect(formatInvoiceNumber("RE-{N}", 12345, D)).toBe("RE-12345");
  });

  it("handles NNN (3-digit padding)", () => {
    expect(formatInvoiceNumber("RE-{NNN}", 5, D)).toBe("RE-005");
  });

  it("handles NN (2-digit padding)", () => {
    expect(formatInvoiceNumber("RE-{NN}", 5, D)).toBe("RE-05");
  });

  it("does not zero-pad counters that exceed pattern width", () => {
    expect(formatInvoiceNumber("RE-{NNNN}", 12345, D)).toBe("RE-12345");
  });

  it("supports multiple occurrences of a placeholder", () => {
    expect(formatInvoiceNumber("{YYYY}/{NNNN}/{YYYY}", 1, D)).toBe("2026/0001/2026");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(formatInvoiceNumber("RE-{ZZZ}-{NNNN}", 1, D)).toBe("RE-{ZZZ}-0001");
  });
});

describe("draft numbers", () => {
  it("recognizes the DRAFT- placeholder", () => {
    expect(isDraftNumber("DRAFT-abcdef")).toBe(true);
    expect(isDraftNumber("RE-2026-0001")).toBe(false);
    expect(isDraftNumber(null)).toBe(false);
  });

  it("generates distinct placeholders that are recognized as drafts", () => {
    const [a, b] = [draftPlaceholder(), draftPlaceholder()];
    expect(isDraftNumber(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("shows only drafts as 'Entwurf #<4 chars>'", () => {
    expect(displayInvoiceNumber({ number: "DRAFT-1a2b3c4d5e", status: "draft" })).toBe("Entwurf #1a2b");
    expect(displayInvoiceNumber({ number: "DRAFT-1a2b3c4d5e", status: "sent" })).toBe("DRAFT-1a2b3c4d5e");
    expect(displayInvoiceNumber({ number: "RE-2026-0001", status: "draft" })).toBe("RE-2026-0001");
  });
});
