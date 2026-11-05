import { describe, expect, it } from "vitest";
import { firstValidatableFile, validationVerdictLabel } from "./validate-files";

describe("firstValidatableFile", () => {
  it("picks the first PDF or XML regardless of case", () => {
    expect(firstValidatableFile(["C:/a.txt", "C:/b.PDF", "C:/c.xml"])).toBe("C:/b.PDF");
    expect(firstValidatableFile(["/x/rechnung.XML"])).toBe("/x/rechnung.XML");
  });

  it("returns null when nothing can be validated", () => {
    expect(firstValidatableFile([])).toBeNull();
    expect(firstValidatableFile(["/a.docx", "/b.png"])).toBeNull();
  });
});

describe("validationVerdictLabel", () => {
  it("uses German labels instead of the validator's ACCEPTABLE/REJECTED", () => {
    expect(validationVerdictLabel(true)).toBe("Bestanden");
    expect(validationVerdictLabel(false)).toBe("Abgelehnt");
  });
});
