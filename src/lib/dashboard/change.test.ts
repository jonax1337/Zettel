import { describe, expect, it } from "vitest";
import { changeBetween, describeChange } from "./change";

describe("changeBetween", () => {
  it("gives the percentage against a positive previous value", () => {
    expect(changeBetween(11_200, 10_000)).toEqual({ direction: "up", percent: 12, differenceCent: 1_200 });
    expect(changeBetween(7_500, 10_000)).toEqual({ direction: "down", percent: 25, differenceCent: -2_500 });
  });

  it("gives no percentage when the previous value is zero or negative", () => {
    expect(changeBetween(500, 0).percent).toBeNull();
    expect(changeBetween(500, -200)).toEqual({ direction: "up", percent: null, differenceCent: 700 });
  });

  it("gives no percentage when it would round to zero", () => {
    expect(changeBetween(1_000_001, 1_000_000).percent).toBeNull();
  });

  it("reports an unchanged value", () => {
    expect(changeBetween(0, 0)).toEqual({ direction: "same", percent: null, differenceCent: 0 });
  });
});

describe("describeChange", () => {
  it("words a percentage", () => {
    expect(describeChange(changeBetween(11_200, 10_000))).toBe("12 % mehr als im Vorjahreszeitraum");
    expect(describeChange(changeBetween(7_500, 10_000))).toBe("25 % weniger als im Vorjahreszeitraum");
  });

  it("falls back to the amount where a percentage would mislead", () => {
    expect(describeChange(changeBetween(-5_000, 0))).toMatch(/^50,00\s€ weniger als im Vorjahreszeitraum$/);
  });

  it("words no change", () => {
    expect(describeChange(changeBetween(10, 10))).toBe("Genauso viel wie im Vorjahreszeitraum");
  });
});
