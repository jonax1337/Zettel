import { describe, expect, it } from "vitest";
import { skontoFormFromSettings, skontoFormFromStored, skontoInput } from "./skonto-form";

describe("skontoFormFromSettings", () => {
  it("adopts the default terms when active", () => {
    expect(
      skontoFormFromSettings({ defaultSkontoActive: true, defaultSkontoPercent: 3, defaultSkontoDays: 10 }),
    ).toEqual({ enabled: true, percent: 3, days: 10 });
  });

  it("stays disabled with fallback terms when inactive", () => {
    expect(
      skontoFormFromSettings({ defaultSkontoActive: false, defaultSkontoPercent: 3, defaultSkontoDays: 10 }),
    ).toEqual({ enabled: false, percent: 2, days: 7 });
  });
});

describe("skontoFormFromStored", () => {
  it("enables only when both values are stored", () => {
    expect(skontoFormFromStored(2.5, 14)).toEqual({ enabled: true, percent: 2.5, days: 14 });
    expect(skontoFormFromStored(2.5, null).enabled).toBe(false);
    expect(skontoFormFromStored(null, 14).enabled).toBe(false);
  });
});

describe("skontoInput", () => {
  const form = { enabled: true, percent: 2, days: 7 };

  it("passes the terms through when enabled", () => {
    expect(skontoInput(form)).toEqual({ skontoPercent: 2, skontoDays: 7 });
  });

  it("clears the terms when disabled or not allowed (credit note)", () => {
    expect(skontoInput({ ...form, enabled: false })).toEqual({ skontoPercent: null, skontoDays: null });
    expect(skontoInput(form, false)).toEqual({ skontoPercent: null, skontoDays: null });
  });
});
