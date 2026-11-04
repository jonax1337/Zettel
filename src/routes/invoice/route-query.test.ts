import { describe, expect, it } from "vitest";
import { intQueryParam, preselectedCustomerId, queryParam } from "./route-query";

const customers = [{ id: 3 }, { id: 7 }];

describe("queryParam", () => {
  it("reads a value and returns null when absent or no query", () => {
    expect(queryParam("a=1&b=2", "b")).toBe("2");
    expect(queryParam("a=1", "b")).toBeNull();
    expect(queryParam(undefined, "a")).toBeNull();
    expect(queryParam("", "a")).toBeNull();
  });
});

describe("intQueryParam", () => {
  it("parses integers and rejects garbage", () => {
    expect(intQueryParam("fromInvoice=42", "fromInvoice")).toBe(42);
    expect(intQueryParam("fromInvoice=abc", "fromInvoice")).toBeNull();
    expect(intQueryParam("", "fromInvoice")).toBeNull();
  });
});

describe("preselectedCustomerId", () => {
  it("returns the id of a known customer", () => {
    expect(preselectedCustomerId("customerId=7", customers)).toBe("7");
  });
  it("returns empty for unknown, malformed or missing ids", () => {
    expect(preselectedCustomerId("customerId=99", customers)).toBe("");
    expect(preselectedCustomerId("customerId=x", customers)).toBe("");
    expect(preselectedCustomerId(undefined, customers)).toBe("");
  });
});
