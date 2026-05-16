import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateCheck =
  | { available: false }
  | { available: true; version: string; notes?: string; install: () => Promise<void> };

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!isTauri()) return { available: false };
  const update: Update | null = await check();
  if (!update) return { available: false };
  return {
    available: true,
    version: update.version,
    notes: update.body ?? undefined,
    install: async () => {
      await update.downloadAndInstall();
      await relaunch();
    },
  };
}

export async function installAndRestart(update: { install: () => Promise<void> }): Promise<void> {
  await update.install();
}
