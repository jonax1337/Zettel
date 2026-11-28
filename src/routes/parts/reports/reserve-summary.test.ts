import { describe, expect, it } from "vitest";
import { prepaymentStatus } from "./reserve-summary";

describe("prepaymentStatus", () => {
  it("rounds the covered share of the burden", () => {
    expect(prepaymentStatus(124_000, 60_000)).toEqual({ kind: "against-burden", percent: 48, surplusCent: 0 });
  });

  it("caps at 100 % and names the surplus when prepayments exceed the burden", () => {
    expect(prepaymentStatus(50_000, 80_000)).toEqual({ kind: "against-burden", percent: 100, surplusCent: 30_000 });
  });

  it("has no prepayments to show when none are recorded", () => {
    expect(prepaymentStatus(124_000, 0)).toEqual({ kind: "none" });
    expect(prepaymentStatus(0, 0)).toEqual({ kind: "none" });
  });

  it("does not claim missing prepayments when there is no burden to set them against", () => {
    expect(prepaymentStatus(0, 60_000)).toEqual({ kind: "no-burden", surplusCent: 60_000 });
    expect(prepaymentStatus(-10_000, 60_000)).toEqual({ kind: "no-burden", surplusCent: 60_000 });
  });
});
