/** Moves `current` by `delta` through a list of `length` entries, wrapping at both ends. */
export function cycleIndex(current: number, delta: number, length: number): number {
  if (length === 0) return 0;
  return (((current + delta) % length) + length) % length;
}
