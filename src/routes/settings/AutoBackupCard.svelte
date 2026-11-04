<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { join } from "@tauri-apps/api/path";
  import {
    Label,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Select,
    toast,
  } from "$lib/ui";
  import { History } from "$lib/brand-icons";
  import { loadSettings, saveAutoBackupInterval } from "$lib/db/queries";
  import { formatDateTime } from "$lib/utils/date";
  import { lastAutoBackupFailure, type AutoBackupFailure } from "$lib/utils/auto-backup";

  // A fresh installation starts with auto-backup switched off (DB default 0).
  const intervalOptions = [
    { value: "0", label: "Aus (Standard)" },
    { value: "1", label: "Täglich" },
    { value: "3", label: "Alle 3 Tage" },
    { value: "7", label: "Wöchentlich (empfohlen)" },
    { value: "14", label: "Alle 2 Wochen" },
    { value: "30", label: "Monatlich" },
  ];

  let intervalDays = $state("0");
  let lastBackupAt = $state<number | null>(null);
  let lastFailure = $state<AutoBackupFailure | null>(null);
  let backupDir = $state<string | null>(null);
  let saving = $state(false);

  onMount(async () => {
    lastFailure = lastAutoBackupFailure();
    try {
      const settings = await loadSettings();
      intervalDays = String(settings.autoBackupIntervalDays);
      lastBackupAt = settings.lastAutoBackupAt;
    } catch (e) {
      toast.error("Auto-Backup-Einstellung konnte nicht geladen werden", String(e));
    }
    try {
      backupDir = await join(await invoke<string>("get_documents_root"), "Backups");
    } catch (e) {
      console.error("Resolving the backup folder failed", e);
    }
  });

  async function saveInterval(newValue: string) {
    saving = true;
    try {
      await saveAutoBackupInterval(Number.parseInt(newValue, 10));
      intervalDays = newValue;
      toast.success("Auto-Backup gespeichert");
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      saving = false;
    }
  }

  function formatTimestamp(unixSeconds: number | null): string {
    if (!unixSeconds) return "noch nie";
    return formatDateTime(unixSeconds);
  }
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <History class="size-5" />
      Auto-Backup
    </CardTitle>
    <CardDescription>
      Rotierender Wochen-Snapshot <code>auto-&lt;wochentag&gt;.zip</code> im Ordner
      <code class="break-all">{backupDir ?? "Zettel/Backups"}</code>.
      Unverschlüsselt, läuft beim App-Start. Im Sandbox-Modus deaktiviert.
    </CardDescription>
  </CardHeader>
  <CardContent class="space-y-3">
    <div class="flex flex-col gap-1.5 max-w-md">
      <Label>Intervall</Label>
      <Select
        items={intervalOptions}
        value={intervalDays}
        onValueChange={saveInterval}
        disabled={saving}
      />
    </div>
    <p class="text-xs text-muted-foreground">
      Letzte Ausführung: <strong>{formatTimestamp(lastBackupAt)}</strong>.
      Maximal 7 Slots (ein Slot pro Wochentag) — älteste werden zyklisch
      überschrieben. Für verschlüsselte oder externe Backups nutze „Backup erstellen" oben.
    </p>
    {#if lastFailure}
      <p class="text-xs text-destructive break-words">
        Letzter Fehlversuch am {formatTimestamp(lastFailure.at)}: {lastFailure.message}
      </p>
    {/if}
  </CardContent>
</Card>
