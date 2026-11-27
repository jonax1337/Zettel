import { describe, expect, it } from "vitest";
import { barWidthFor, columnPath, labelStride, MAX_BAR_WIDTH, niceScale } from "./chart-geometry";

describe("niceScale", () => {
  it("rounds the top up to a tick and starts at zero", () => {
    expect(niceScale(0, 335_000)).toEqual({ min: 0, max: 400_000, ticks: [0, 100_000, 200_000, 300_000, 400_000] });
  });

  it("picks a tick step of 1, 2, 2.5 or 5 times a power of ten", () => {
    expect(niceScale(0, 1_000_000).ticks).toEqual([0, 250_000, 500_000, 750_000, 1_000_000]);
    expect(niceScale(0, 800_000).ticks).toEqual([0, 200_000, 400_000, 600_000, 800_000]);
  });

  it("gives data that is all zero a usable grid", () => {
    expect(niceScale(0, 0)).toEqual({ min: 0, max: 100_000, ticks: [0, 25_000, 50_000, 75_000, 100_000] });
  });

  it("reaches below zero for a month with a credit note", () => {
    const scale = niceScale(-50_000, 200_000);

    expect(scale.min).toBeLessThan(0);
    expect(scale.ticks).toContain(0);
    expect(scale.max).toBeGreaterThanOrEqual(200_000);
  });

  it("never steps finer than one euro", () => {
    expect(niceScale(0, 150).ticks.every((tick) => tick % 100 === 0)).toBe(true);
  });
});

describe("barWidthFor", () => {
  it("caps a bar at the width of a thin mark", () => {
    expect(barWidthFor(400, 1)).toBe(MAX_BAR_WIDTH);
  });

  it("shrinks bars in a narrow band but keeps them visible", () => {
    expect(barWidthFor(60, 2)).toBe(21);
    expect(barWidthFor(5, 2)).toBe(2);
  });
});

describe("labelStride", () => {
  it("labels every band when they are wide and thins out narrow ones", () => {
    expect(labelStride(60, 34)).toBe(1);
    expect(labelStride(8, 34)).toBe(5);
  });
});

describe("columnPath", () => {
  it("rounds the top corners and leaves the baseline square", () => {
    expect(columnPath(10, 14, 100, 60)).toBe("M10 100V64Q10 60 14 60H20Q24 60 24 64V100Z");
  });

  it("rounds the bottom corners for a value below the baseline", () => {
    expect(columnPath(10, 14, 100, 140)).toBe("M10 100V136Q10 140 14 140H20Q24 140 24 136V100Z");
  });

  it("draws a bar of at least one pixel and rounds it no more than its height", () => {
    expect(columnPath(10, 14, 100, 100)).toBe("M10 100V100Q10 99 11 99H23Q24 99 24 100V100Z");
  });
});
