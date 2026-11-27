/** The expense list hands a dropped PDF to the editor, which opens on another route. */
let pendingPath: string | null = null;

export function setPendingImport(path: string): void {
  pendingPath = path;
}

export function takePendingImport(): string | null {
  const path = pendingPath;
  pendingPath = null;
  return path;
}

/**
 * Runs the import once the data it matches against has loaded, whether or not loading
 * succeeded, and not at all when the editor was left in the meantime.
 */
export async function importWhenReady(
  path: string,
  ready: Promise<unknown>,
  isAlive: () => boolean,
  run: (path: string) => void | Promise<void>,
): Promise<void> {
  await ready.catch(() => undefined);
  if (isAlive()) await run(path);
}
