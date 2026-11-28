/** Hides lines without an amount unless the user asks for them; `emptyCount` feeds the toggle label. */
export function partitionEmptyLines<T>(
  lines: T[],
  isEmpty: (line: T) => boolean,
  showEmpty: boolean,
): { lines: T[]; emptyCount: number } {
  const emptyCount = lines.filter(isEmpty).length;
  return { lines: showEmpty ? lines : lines.filter((line) => !isEmpty(line)), emptyCount };
}
