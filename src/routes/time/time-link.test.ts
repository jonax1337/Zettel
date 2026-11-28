import { describe, expect, it } from "vitest";
import { timeLinkFilters, unbilledTimeHref } from "./time-link";

describe("timeLinkFilters", () => {
  it("reads the customer and the status", () => {
    expect(timeLinkFilters("customerId=7&status=open")).toEqual({ customerId: "7", status: "open" });
  });

  it("accepts either one alone", () => {
    expect(timeLinkFilters("status=billed")).toEqual({ status: "billed" });
    expect(timeLinkFilters("customerId=3")).toEqual({ customerId: "3" });
  });

  it("ignores values that are not valid and returns null when nothing is left", () => {
    expect(timeLinkFilters("customerId=abc&status=weird")).toBeNull();
    expect(timeLinkFilters("customerId=abc&status=all")).toEqual({ status: "all" });
    expect(timeLinkFilters("new=1")).toBeNull();
    expect(timeLinkFilters(undefined)).toBeNull();
  });

  it("round-trips the link built for a customer's unbilled time", () => {
    const [, query] = unbilledTimeHref(12).split("?");

    expect(timeLinkFilters(query)).toEqual({ customerId: "12", status: "open" });
  });
});
