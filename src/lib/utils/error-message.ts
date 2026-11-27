/** The message of whatever a failed call threw. Tauri commands reject with plain strings, the db layer with Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
