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
import { loadSettings, saveSettings } from "$lib/db/queries";
import type { Settings } from "$lib/db/schema";
import { writeBackupZip } from "./backup";
import { nowUnix, SECONDS_PER_DAY } from "./date";

const WEEKDAY_SLUGS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const SECONDS_PER_HOUR = 3_600;

type AutoBackupOutcome = { ran: boolean; reason: string };

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
    return { ran: false, reason: `loadSettings failed: ${e}` };
  }

  const now = nowUnix();
  const reason = skipReason(settings, now);
  if (reason) return { ran: false, reason };

  try {
    const targetPath = await writeAutoBackup(backupFilename(new Date()));
    await saveSettings({ ...settings, lastAutoBackupAt: now });
    return { ran: true, reason: `Backup gespeichert: ${targetPath}` };
  } catch (e) {
    return { ran: false, reason: `Backup fehlgeschlagen: ${e}` };
  }
}
