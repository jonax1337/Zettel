/** Stable string form of a form's state, used to tell edited from untouched. */
export function snapshotOf(value: unknown): string | null {
  try {
    return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    // An unserialisable form can't be compared; treating it as clean beats blocking navigation forever.
    return null;
  }
}

export function isEdited(baseline: string | null, current: unknown): boolean {
  return baseline !== null && snapshotOf(current) !== baseline;
}

/** Forms that currently hold unsaved edits; navigation asks before leaving while any is dirty. */
export function createDirtyRegistry() {
  const checks = new Set<() => boolean>();
  return {
    register(isDirty: () => boolean): () => void {
      checks.add(isDirty);
      return () => checks.delete(isDirty);
    },
    isDirty(): boolean {
      return [...checks].some((isDirty) => isDirty());
    },
  };
}

export const dirtyForms = createDirtyRegistry();
