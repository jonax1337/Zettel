import { describe, expect, it } from "vitest";
import { pickDroppedPdf } from "./dropped-files";

describe("pickDroppedPdf", () => {
  it("takes the only PDF without ignoring anything", () => {
    expect(pickDroppedPdf(["C:/a/Rechnung.PDF"])).toEqual({ pdf: "C:/a/Rechnung.PDF", ignoredCount: 0 });
  });

  it("processes the first PDF and counts every other dropped file as ignored", () => {
    expect(pickDroppedPdf(["a.txt", "b.pdf", "c.pdf"])).toEqual({ pdf: "b.pdf", ignoredCount: 2 });
  });

  it("returns no PDF and no ignored files when none was dropped", () => {
    expect(pickDroppedPdf(["a.txt"])).toEqual({ pdf: null, ignoredCount: 0 });
    expect(pickDroppedPdf([])).toEqual({ pdf: null, ignoredCount: 0 });
  });
});
