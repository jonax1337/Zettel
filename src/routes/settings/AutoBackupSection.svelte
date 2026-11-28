<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { join } from "@tauri-apps/api/path";
  import { Label, Select, toast, FormSection } from "$lib/ui";
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
      toast.error("Auto-Backup-Einstellung konnte nicht geladen werden", errorMessage(e));
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
      toast.error("Speichern fehlgeschlagen", errorMessage(e));
    } finally {
      saving = false;
    }
  }

  function formatTimestamp(unixSeconds: number | null): string {
    if (!unixSeconds) return "noch nie";
    return formatDateTime(unixSeconds);
  }
</script>

<FormSection level={3} title="Auto-Backup">
  <p class="mb-3.5 text-[13px] text-muted-foreground">
    Rotierender Wochen-Snapshot <code>auto-&lt;wochentag&gt;.zip</code> im Ordner:
    <code class="mt-1 block">
      {#each (backupDir ?? "Zettel/Backups").split(/(?<=[\\/])/) as part, index (index)}{part}<wbr />{/each}
    </code>
    Unverschlüsselt, läuft beim App-Start. Im Sandbox-Modus deaktiviert.
  </p>
  <div class="flex max-w-md flex-col gap-1.5">
    <Label class="font-bold">Intervall</Label>
    <Select
      items={intervalOptions}
      value={intervalDays}
      onValueChange={saveInterval}
      disabled={saving}
    />
  </div>
  <p class="mt-2.5 text-[12.5px] text-muted-foreground">
    Letzte Ausführung: <strong>{formatTimestamp(lastBackupAt)}</strong>.
    Maximal 7 Slots (ein Slot pro Wochentag), die ältesten werden zyklisch
    überschrieben. Für verschlüsselte oder externe Backups nutze „Backup erstellen“ oben.
  </p>
  {#if lastFailure}
    <p class="mt-2 text-[12.5px] break-words text-destructive">
      Letzter Fehlversuch am {formatTimestamp(lastFailure.at)}: {lastFailure.message}
    </p>
  {/if}
</FormSection>
