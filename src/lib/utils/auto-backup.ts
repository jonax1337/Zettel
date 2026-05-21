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
import { execute } from "$lib/db/client";
import { loadSettings, saveSettings } from "$lib/db/queries";

const WEEKDAY_SLUGS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function weekdaySlug(date: Date): string {
  return WEEKDAY_SLUGS[date.getDay()];
}

const CURRENT_DB_SCHEMA_VERSION = 24;

export async function maybeRunAutoBackup(): Promise<{ ran: boolean; reason: string }> {
  let settings;
  try {
    settings = await loadSettings();
  } catch (e) {
    return { ran: false, reason: `loadSettings failed: ${e}` };
  }

  const intervalDays = settings.autoBackupIntervalDays;
  if (!intervalDays || intervalDays <= 0) {
    return { ran: false, reason: "Auto-Backup deaktiviert (interval = 0)." };
  }

  const now = Math.floor(Date.now() / 1000);
  const last = settings.lastAutoBackupAt ?? 0;
  const dueAt = last + intervalDays * 86400;
  if (last > 0 && now < dueAt) {
    const hoursLeft = Math.round((dueAt - now) / 3600);
    return { ran: false, reason: `Nächstes Auto-Backup in ~${hoursLeft} h.` };
  }

  // Snapshot + Bundle.
  try {
    const slug = weekdaySlug(new Date());
    const filename = `auto-${slug}.zip`;
    const targetPath = await invoke<string>("auto_backup_target", { filename });
    const snapshotPath = await invoke<string>("snapshot_db_path");
    await execute(`VACUUM INTO ?`, [snapshotPath]);
    await invoke<string>("bundle_backup", {
      snapshotPath,
      targetZip: targetPath,
      invoiceCount: null,
      dbSchemaVersion: CURRENT_DB_SCHEMA_VERSION,
      password: null,
    });
    await saveSettings({ ...settings, lastAutoBackupAt: now });
    return { ran: true, reason: `Backup gespeichert: ${targetPath}` };
  } catch (e) {
    return { ran: false, reason: `Backup fehlgeschlagen: ${e}` };
  }
}
