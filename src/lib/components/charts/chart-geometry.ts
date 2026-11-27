export const MAX_BAR_WIDTH = 24;
export const BAR_RADIUS = 4;

const MIN_BAR_WIDTH = 2;
const MIN_BAR_HEIGHT = 1;
const BAND_FILL = 0.7;
const SCALE_STEPS = [1, 2, 2.5, 5, 10];
/** One euro, in cents: finer axis steps would label the same euro twice. */
const MIN_STEP = 100;
/** Axis range for data that is all zero, so the grid does not collapse. */
const EMPTY_SCALE_MAX = 100_000;

export type Scale = { min: number; max: number; ticks: number[] };

/** Axis from 0 (or the lowest negative value) to the highest value, on round tick values. */
export function niceScale(lowest: number, highest: number, maxIntervals = 4): Scale {
  const low = Math.min(0, lowest);
  const highestValue = Math.max(0, highest);
  const high = highestValue === low ? EMPTY_SCALE_MAX : highestValue;
  const rawStep = (high - low) / maxIntervals;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(MIN_STEP, (SCALE_STEPS.find((s) => s * magnitude >= rawStep) ?? 10) * magnitude);
  const min = Math.floor(low / step) * step;
  const max = Math.max(Math.ceil(high / step) * step, min + step);
  const ticks: number[] = [];
  for (let tick = min; tick <= max; tick += step) ticks.push(tick);
  return { min, max, ticks };
}

/** Width of one bar when `perBand` bars share a band; never wider than a thin mark should be. */
export function barWidthFor(bandWidth: number, perBand: number): number {
  return Math.max(MIN_BAR_WIDTH, Math.min(MAX_BAR_WIDTH, Math.floor((bandWidth * BAND_FILL) / perBand)));
}

/** Every n-th label, so neighbouring labels do not touch. */
export function labelStride(bandWidth: number, minLabelWidth: number): number {
  return Math.max(1, Math.ceil(minLabelWidth / bandWidth));
}

/**
 * A column standing on `baseY` and ending at `valueY`: rounded at the data end,
 * square at the baseline. It grows downwards for a value below the baseline.
 */
export function columnPath(x: number, width: number, baseY: number, valueY: number): string {
  const direction = valueY <= baseY ? -1 : 1;
  const height = Math.max(MIN_BAR_HEIGHT, Math.abs(baseY - valueY));
  const endY = baseY + direction * height;
  const radius = Math.min(BAR_RADIUS, height, width / 2);
  const right = x + width;
  const curveStartY = endY - direction * radius;
  return [
    `M${x} ${baseY}`,
    `V${curveStartY}`,
    `Q${x} ${endY} ${x + radius} ${endY}`,
    `H${right - radius}`,
    `Q${right} ${endY} ${right} ${curveStartY}`,
    `V${baseY}`,
    "Z",
  ].join("");
}

const euroWhole = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const wholeNumber = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

/** "3.350 €", for the one label a chart prints directly. */
export function formatEuroWhole(cents: number): string {
  return euroWhole.format(cents / 100);
}

/** "4.000", for axis ticks; the unit stays out of the way. */
export function formatAxisValue(cents: number): string {
  return wholeNumber.format(cents / 100);
}
