import { describe, expect, it } from "vitest";
import type { Settings } from "$lib/db/schema";
import { formatInvoiceNumber } from "$lib/utils/invoice-number";
import {
  NUMBER_SEQUENCES,
  counterProblem,
  numberFormatProblem,
  numberingBlockReason,
  numberingProblems,
} from "./numbering-form";

const valid = {
  invoiceNumberFormat: "RE-{YYYY}-{NNNN}",
  invoiceNumberCounter: 17,
  offerNumberFormat: "AN-{YYYY}-{NNNN}",
  offerNumberCounter: 0,
  reminderNumberFormat: "MA-{YYYY}-{NNNN}",
  reminderNumberCounter: 1,
  expenseNumberFormat: "EX-{YYYY}-{NNNN}",
  expenseNumberCounter: 13,
} as Settings;

describe("counterProblem", () => {
  it("accepts zero and positive whole numbers", () => {
    expect(counterProblem(0)).toBeNull();
    expect(counterProblem(17)).toBeNull();
  });

  it("rejects a cleared field, which binds as null", () => {
    expect(counterProblem(null)).toMatch(/Zähler/);
    expect(counterProblem(undefined)).not.toBeNull();
    expect(counterProblem(Number.NaN)).not.toBeNull();
  });

  it("rejects negative and fractional values", () => {
    expect(counterProblem(-1)).toMatch(/negativ/);
    expect(counterProblem(2.5)).toMatch(/ganze Zahl/);
  });
});

describe("numberFormatProblem", () => {
  it("accepts one to four N as the running number", () => {
    for (const format of ["RE-{YYYY}-{NNNN}", "{N}", "{NN}/{YY}", "K-{NNN}", "{YYYY}{MM}-{NNNN}"]) {
      expect(numberFormatProblem(format), format).toBeNull();
    }
  });

  it("rejects an empty or blank format", () => {
    expect(numberFormatProblem("")).toMatch(/Nummernformat/);
    expect(numberFormatProblem("   ")).not.toBeNull();
    expect(numberFormatProblem(null)).not.toBeNull();
  });

  it("rejects a format without a running number, whose numbers would all be equal", () => {
    expect(numberFormatProblem("RE-{YYYY}")).toMatch(/laufende Nummer/);
    expect(numberFormatProblem("RE-2026")).not.toBeNull();
  });

  it("rejects five or more N, which formatInvoiceNumber leaves literal", () => {
    expect(numberFormatProblem("RE-{NNNNN}")).toMatch(/vier Stellen/);
    expect(numberFormatProblem("RE-{NNNNN}-{NN}")).toMatch(/vier Stellen/);
  });

  it("only accepts formats that give a different number for each counter", () => {
    const formats = ["RE-{YYYY}-{NNNN}", "{N}", "RE-{NNNNN}", "RE-{YYYY}", "RE-{NNNNN}-{N}", ""];
    for (const format of formats) {
      const distinct = formatInvoiceNumber(format, 1) !== formatInvoiceNumber(format, 2);
      if (numberFormatProblem(format) === null) expect(distinct, format).toBe(true);
    }
  });
});

describe("numberingProblems", () => {
  it("reports nothing for the default sequences", () => {
    for (const problem of Object.values(numberingProblems(valid))) {
      expect(problem).toEqual({ format: null, counter: null });
    }
    expect(numberingBlockReason(valid)).toBeNull();
  });

  it("checks all four sequences", () => {
    for (const { key, counterKey, formatKey } of NUMBER_SEQUENCES) {
      const noCounter = { ...valid, [counterKey]: null } as unknown as Settings;
      expect(numberingProblems(noCounter)[key].counter, key).not.toBeNull();
      expect(numberingBlockReason(noCounter), key).not.toBeNull();

      const badFormat = { ...valid, [formatKey]: "X-{YYYY}" } as Settings;
      expect(numberingProblems(badFormat)[key].format, key).not.toBeNull();
      expect(numberingBlockReason(badFormat), key).not.toBeNull();
    }
  });

  it("labels the expense sequence as the internal number", () => {
    expect(NUMBER_SEQUENCES.find((s) => s.key === "expense")?.title).toBe("Ausgaben (interne Nummer)");
  });
});
