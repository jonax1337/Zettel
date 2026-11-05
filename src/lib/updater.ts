import { invoke } from "@tauri-apps/api/core";
import { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { version as appVersion } from "../../package.json";

export type UpdateChannel = "stable" | "beta";

export type UpdateCheck =
  | { available: false }
  | { available: true; version: string; notes?: string; install: () => Promise<void> };

const CHANNEL_STORAGE_KEY = "zettel.update_channel";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** A semver pre-release such as `0.23.0-rc.1`. */
export function isPrerelease(version: string): boolean {
  return version.split("+")[0].includes("-");
}

/** Someone running a pre-release stays on the beta channel until they opt out. */
export function resolveUpdateChannel(stored: string | null, currentVersion: string): UpdateChannel {
  if (stored === "stable" || stored === "beta") return stored;
  return isPrerelease(currentVersion) ? "beta" : "stable";
}

export function getUpdateChannel(): UpdateChannel {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(CHANNEL_STORAGE_KEY);
  } catch {
    // Blocked storage falls back to the channel derived from the installed version.
  }
  return resolveUpdateChannel(stored, appVersion);
}

export function setUpdateChannel(channel: UpdateChannel): void {
  try {
    localStorage.setItem(CHANNEL_STORAGE_KEY, channel);
  } catch (e) {
    throw new Error(`Update-Kanal konnte nicht gespeichert werden: ${String(e)}`);
  }
}

type UpdateMetadata = ConstructorParameters<typeof Update>[0];

export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!isTauri()) return { available: false };
  const metadata = await invoke<UpdateMetadata | null>("check_for_update", {
    channel: getUpdateChannel(),
  });
  if (!metadata) return { available: false };
  const update = new Update(metadata);
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
