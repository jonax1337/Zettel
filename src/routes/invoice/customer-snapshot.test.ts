import { describe, expect, it } from "vitest";
import { parseCustomerSnapshot } from "./customer-snapshot";

describe("parseCustomerSnapshot", () => {
  it("parses a stored snapshot", () => {
    expect(parseCustomerSnapshot('{"name":"ACME"}')).toMatchObject({ name: "ACME" });
  });

  it("returns null for corrupt JSON", () => {
    expect(parseCustomerSnapshot("{not json")).toBeNull();
    expect(parseCustomerSnapshot("")).toBeNull();
  });
});
