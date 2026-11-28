import { describe, expect, it } from "vitest";
import { baseName, findingSeverityMeta, firstValidatableFile, validationVerdictLabel } from "./validate-files";

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

describe("baseName", () => {
  it("strips Windows and POSIX folders", () => {
    expect(baseName("C:\\Users\\Alex\\RE-2026-0013.pdf")).toBe("RE-2026-0013.pdf");
    expect(baseName("/home/alex/rechnung.xml")).toBe("rechnung.xml");
  });

  it("keeps a bare file name", () => {
    expect(baseName("rechnung.xml")).toBe("rechnung.xml");
  });
});

describe("findingSeverityMeta", () => {
  it("gives each known severity its own tone", () => {
    expect(findingSeverityMeta("error")).toEqual({ label: "Fehler", variant: "late" });
    expect(findingSeverityMeta("warning")).toEqual({ label: "Warnung", variant: "open" });
    expect(findingSeverityMeta("info")).toEqual({ label: "Hinweis", variant: "calm" });
  });

  it("shows an unknown severity as reported, in the strictest tone", () => {
    expect(findingSeverityMeta("fatal")).toEqual({ label: "fatal", variant: "late" });
  });
});
