<script lang="ts">
  import { onMount } from "svelte";
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
  import { loadSettings, saveSettings } from "$lib/db/queries";

  const intervalOptions = [
    { value: "0", label: "Aus" },
    { value: "1", label: "Täglich" },
    { value: "3", label: "Alle 3 Tage" },
    { value: "7", label: "Wöchentlich (Standard)" },
    { value: "14", label: "Alle 2 Wochen" },
    { value: "30", label: "Monatlich" },
  ];

  let intervalDays = $state("0");
  let lastBackupAt = $state<number | null>(null);
  let saving = $state(false);

  onMount(async () => {
    try {
      const settings = await loadSettings();
      intervalDays = String(settings.autoBackupIntervalDays);
      lastBackupAt = settings.lastAutoBackupAt;
    } catch (e) {
      toast.error("Auto-Backup-Einstellung konnte nicht geladen werden", String(e));
    }
  });

  async function saveInterval(newValue: string) {
    saving = true;
    try {
      const current = await loadSettings();
      await saveSettings({ ...current, autoBackupIntervalDays: Number.parseInt(newValue, 10) });
      intervalDays = newValue;
      toast.success("Auto-Backup gespeichert");
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      saving = false;
    }
  }

  function formatLastBackup(unixSeconds: number | null): string {
    if (!unixSeconds) return "noch nie";
    return new Date(unixSeconds * 1000).toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <History class="size-5" />
      Auto-Backup
    </CardTitle>
    <CardDescription>
      Rotierender Wochen-Snapshot (<code>auto-&lt;wochentag&gt;.zip</code>) im Ordner „Zettel/Backups“ deiner Dokumente.
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
      Letzte Ausführung: <strong>{formatLastBackup(lastBackupAt)}</strong>.
      Maximal 7 Slots (ein Slot pro Wochentag) — älteste werden zyklisch
      überschrieben. Für verschlüsselte oder externe Backups nutze „Backup erstellen" oben.
    </p>
  </CardContent>
</Card>
