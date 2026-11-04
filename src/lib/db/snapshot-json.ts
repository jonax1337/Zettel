/**
 * Snapshots are written by this app, so a parse failure means a hand-edited or
 * corrupt row. Callers fall back to placeholders instead of failing; the warning
 * keeps the corruption visible.
 */
export function parseSnapshot<T extends object>(json: string, context: string): Partial<T> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object") {
      throw new TypeError("Snapshot ist kein JSON-Objekt");
    }
    return parsed as Partial<T>;
  } catch (e) {
    console.warn(`${context}: Snapshot nicht lesbar, verwende Platzhalter:`, e);
    return {};
  }
}
