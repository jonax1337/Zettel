import { describe, expect, it } from "vitest";
import { escapeCsvField } from "./csv";

describe("escapeCsvField", () => {
  it("leaves plain text untouched", () => {
    expect(escapeCsvField("Beratung Mai")).toBe("Beratung Mai");
  });

  it("quotes fields containing the delimiter", () => {
    expect(escapeCsvField("a;b")).toBe('"a;b"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvField('sagt "hallo"')).toBe('"sagt ""hallo"""');
  });

  it("quotes fields containing line breaks, including a bare carriage return", () => {
    expect(escapeCsvField("a\nb")).toBe('"a\nb"');
    expect(escapeCsvField("a\rb")).toBe('"a\rb"');
  });
});
