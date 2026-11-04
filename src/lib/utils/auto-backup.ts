/**
 * Auto-Backup-Scheduler — läuft beim App-Start in Layout.svelte.
 *
 * Strategie: einfache Rotation auf 7 Wochentags-Slots
 * (`auto-mon.zip`...`auto-sun.zip`). Beim Auslösen wird der Slot des
 * aktuellen Wochentags überschrieben — auf einer Woche hat man also genau 7
 * historische Stände, danach wird der älteste zyklisch ersetzt.
 *
 * `lastAutoBackupAt` aus Settings dient als Throttle — wenn das Intervall noch
 * nicht abgelaufen ist, passiert nichts.
 */
import { invoke } from "@tauri-apps/api/core";
import { loadSettings, saveLastAutoBackupAt } from "$lib/db/queries";
import type { Settings } from "$lib/db/schema";
import { writeBackupZip } from "./backup";
import { nowUnix, SECONDS_PER_DAY } from "./date";

const WEEKDAY_SLUGS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const SECONDS_PER_HOUR = 3_600;
const LAST_FAILURE_KEY = "zettel.autoBackup.lastFailure";

export type AutoBackupOutcome = { status: "ran" | "skipped" | "failed"; message: string };
export type AutoBackupFailure = { at: number; message: string };

function backupFilename(date: Date): string {
  return `auto-${WEEKDAY_SLUGS[date.getDay()]}.zip`;
}

/** Null when a backup is due, otherwise the reason it is not. */
function skipReason(settings: Settings, now: number): string | null {
  const intervalDays = settings.autoBackupIntervalDays;
  if (!intervalDays || intervalDays <= 0) return "Auto-Backup deaktiviert (interval = 0).";

  const last = settings.lastAutoBackupAt ?? 0;
  const dueAt = last + intervalDays * SECONDS_PER_DAY;
  if (last > 0 && now < dueAt) {
    const hoursLeft = Math.round((dueAt - now) / SECONDS_PER_HOUR);
    return `Nächstes Auto-Backup in ~${hoursLeft} h.`;
  }
  return null;
}

async function writeAutoBackup(filename: string): Promise<string> {
  const targetPath = await invoke<string>("auto_backup_target", { filename });
  await writeBackupZip(targetPath, null);
  return targetPath;
}

export async function maybeRunAutoBackup(): Promise<AutoBackupOutcome> {
  let settings: Settings;
  try {
    settings = await loadSettings();
  } catch (e) {
    return failed(`Einstellungen nicht lesbar: ${e}`);
  }

  const now = nowUnix();
  const reason = skipReason(settings, now);
  if (reason) return { status: "skipped", message: reason };

  try {
    const targetPath = await writeAutoBackup(backupFilename(new Date()));
    await saveLastAutoBackupAt(now);
    forgetFailure();
    return { status: "ran", message: `Backup gespeichert: ${targetPath}` };
  } catch (e) {
    return failed(String(e));
  }
}

/** The last failed auto-backup on this device, until one succeeds again. */
export function lastAutoBackupFailure(): AutoBackupFailure | null {
  try {
    const stored = localStorage.getItem(LAST_FAILURE_KEY);
    return stored ? (JSON.parse(stored) as AutoBackupFailure) : null;
  } catch {
    return null;
  }
}

function failed(message: string): AutoBackupOutcome {
  try {
    localStorage.setItem(LAST_FAILURE_KEY, JSON.stringify({ at: nowUnix(), message }));
  } catch {
    // Without storage the failure is still reported by the caller's toast.
  }
  return { status: "failed", message };
}

function forgetFailure(): void {
  try {
    localStorage.removeItem(LAST_FAILURE_KEY);
  } catch {
    // Nothing remembered when storage is blocked.
  }
}
