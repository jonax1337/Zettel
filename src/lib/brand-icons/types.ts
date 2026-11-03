import type { Snippet } from "svelte";
import type { SVGAttributes } from "svelte/elements";

type Shape = "path" | "rect" | "circle" | "ellipse" | "line" | "polyline" | "polygon";

export type IconNode = ReadonlyArray<
  readonly [Shape, Readonly<Record<string, string | number>>]
>;

export type IconProps = SVGAttributes<SVGSVGElement> & {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
  title?: string;
  children?: Snippet;
};
