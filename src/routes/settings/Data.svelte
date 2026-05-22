<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { execute } from "$lib/db/client";
  import {
    Button,
    Input,
    Label,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    ConfirmDialog,
    Checkbox,
    Select,
    toast,
  } from "$lib/ui";
  import { Download, Upload, FlaskConical, History } from "@lucide/svelte";
  import { loadSettings, saveSettings } from "$lib/db/queries";

  const CURRENT_DB_SCHEMA_VERSION = 26;

  let sandbox = $state(false);
  let sandboxBusy = $state(false);
  let confirmSandboxToggleOpen = $state(false);
  let pendingSandbox = $state(false);

  let autoBackupInterval = $state<string>("0");
  let lastAutoBackupAt = $state<number | null>(null);
  let autoBackupSaving = $state(false);

  $effect(() => {
    invoke<boolean>("is_sandbox")
      .then((v) => (sandbox = v))
      .catch(() => {});
    loadSettings()
      .then((s) => {
        autoBackupInterval = String(s.autoBackupIntervalDays);
        lastAutoBackupAt = s.lastAutoBackupAt;
      })
      .catch(() => {});
  });

  const intervalOptions = [
    { value: "0", label: "Aus" },
    { value: "1", label: "Täglich" },
    { value: "3", label: "Alle 3 Tage" },
    { value: "7", label: "Wöchentlich (Standard)" },
    { value: "14", label: "Alle 2 Wochen" },
    { value: "30", label: "Monatlich" },
  ];

  async function saveAutoBackup(newValue: string) {
    autoBackupSaving = true;
    try {
      const current = await loadSettings();
      await saveSettings({ ...current, autoBackupIntervalDays: Number.parseInt(newValue, 10) });
      autoBackupInterval = newValue;
      toast.success("Auto-Backup gespeichert");
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      autoBackupSaving = false;
    }
  }

  function formatLastBackup(unix: number | null): string {
    if (!unix) return "noch nie";
    const d = new Date(unix * 1000);
    return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  }

  function requestSandboxToggle(enabled: boolean) {
    pendingSandbox = enabled;
    confirmSandboxToggleOpen = true;
  }

  async function applySandboxToggle() {
    sandboxBusy = true;
    try {
      await invoke("set_sandbox", { enabled: pendingSandbox });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      toast.error("Sandbox konnte nicht umgeschaltet werden", String(e));
    } finally {
      sandboxBusy = false;
    }
  }

  let backupBusy = $state(false);
  let restoreBusy = $state(false);
  let confirmRestoreOpen = $state(false);
  let pendingRestoreZip = $state<string | null>(null);
  let restoreSectionCustomers = $state(true);
  let restoreSectionInvoices = $state(true);
  let restoreSectionSettings = $state(true);
  let backupEncrypt = $state(false);
  let backupPassword = $state("");
  let backupPasswordConfirm = $state("");
  let restorePassword = $state("");
  let restoreNeedsPassword = $state(false);

  const restoreIsFull = $derived(
    restoreSectionCustomers && restoreSectionInvoices && restoreSectionSettings,
  );
  const restoreAnySelected = $derived(
    restoreSectionCustomers || restoreSectionInvoices || restoreSectionSettings,
  );

  function defaultBackupFilename(): string {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const hm = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    return `zettel-backup-${ymd}-${hm}.zip`;
  }

  async function onBackup() {
    if (backupEncrypt) {
      if (backupPassword.length < 8) {
        toast.error("Passwort zu kurz", "Mindestens 8 Zeichen.");
        return;
      }
      if (backupPassword !== backupPasswordConfirm) {
        toast.error("Passwörter stimmen nicht überein");
        return;
      }
    }
    backupBusy = true;
    try {
      const target = await save({
        defaultPath: defaultBackupFilename(),
        filters: [{ name: "Zettel Backup", extensions: ["zip"] }],
      });
      if (!target) return;
      const snapshotPath = await invoke<string>("snapshot_db_path");
      await execute(`VACUUM INTO ?`, [snapshotPath]);
      await invoke<string>("bundle_backup", {
        snapshotPath,
        targetZip: target,
        invoiceCount: null,
        dbSchemaVersion: CURRENT_DB_SCHEMA_VERSION,
        password: backupEncrypt ? backupPassword : null,
      });
      toast.success("Backup gespeichert", target);
      backupPassword = "";
      backupPasswordConfirm = "";
    } catch (e) {
      toast.error("Backup fehlgeschlagen", String(e));
    } finally {
      backupBusy = false;
    }
  }

  async function onPickRestore() {
    const picked = await open({
      multiple: false,
      filters: [{ name: "Zettel Backup", extensions: ["zip"] }],
    });
    if (typeof picked !== "string") return;
    pendingRestoreZip = picked;
    restoreSectionCustomers = true;
    restoreSectionInvoices = true;
    restoreSectionSettings = true;
    restoreNeedsPassword = false;
    restorePassword = "";
  }

  async function onRunRestore() {
    if (!pendingRestoreZip) return;
    if (!restoreAnySelected) {
      toast.error("Nichts ausgewählt", "Bitte mindestens einen Bereich wählen.");
      return;
    }
    if (restoreIsFull) {
      confirmRestoreOpen = true;
      return;
    }
    restoreBusy = true;
    try {
      await invoke<string>("stage_restore", {
        sourceZip: pendingRestoreZip,
        sections: {
          customers: restoreSectionCustomers,
          invoices: restoreSectionInvoices,
          settings: restoreSectionSettings,
        },
        password: restorePassword || null,
      });
      await invoke<void>("apply_pending_partial_restore");
      toast.success(
        "Wiederherstellung abgeschlossen",
        "Die ausgewählten Bereiche wurden eingespielt.",
      );
      pendingRestoreZip = null;
      restorePassword = "";
      restoreNeedsPassword = false;
    } catch (e) {
      const msg = String(e);
      if (msg.includes("password_required")) {
        restoreNeedsPassword = true;
        toast.error("Passwort erforderlich", "Dieses Backup ist verschlüsselt.");
      } else {
        toast.error("Wiederherstellung fehlgeschlagen", msg);
      }
    } finally {
      restoreBusy = false;
    }
  }

  async function onConfirmRestore() {
    if (!pendingRestoreZip) return;
    restoreBusy = true;
    try {
      await invoke<string>("stage_restore", {
        sourceZip: pendingRestoreZip,
        sections: null,
        password: restorePassword || null,
      });
      toast.success(
        "Wiederherstellung vorbereitet",
        "Bitte die App neu starten — das Backup wird beim nächsten Start eingespielt.",
      );
      pendingRestoreZip = null;
      restorePassword = "";
      restoreNeedsPassword = false;
    } catch (e) {
      const msg = String(e);
      if (msg.includes("password_required")) {
        restoreNeedsPassword = true;
        toast.error("Passwort erforderlich", "Dieses Backup ist verschlüsselt.");
      } else {
        toast.error("Wiederherstellung fehlgeschlagen", msg);
        pendingRestoreZip = null;
      }
    } finally {
      restoreBusy = false;
    }
  }
</script>

<SettingsShell
  title="Daten"
  description="Backup, Wiederherstellung und Sandbox-Modus."
>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Backup & Wiederherstellung</CardTitle>
        <CardDescription>
          Sichert die Datenbank und alle erzeugten Rechnungs-PDFs in eine ZIP-Datei.
          Wiederhergestellte Backups werden beim nächsten App-Start eingespielt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="mb-4 space-y-3">
          <label class="flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <Checkbox bind:checked={backupEncrypt} />
            Backup verschlüsseln (AES-256-GCM)
          </label>
          {#if backupEncrypt}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5">
                <Label>Passwort</Label>
                <Input type="password" bind:value={backupPassword} autocomplete="new-password" />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label>Passwort bestätigen</Label>
                <Input type="password" bind:value={backupPasswordConfirm} autocomplete="new-password" />
              </div>
              <span class="sm:col-span-2 text-xs text-muted-foreground">
                Mindestens 8 Zeichen. Ohne dieses Passwort lässt sich das Backup nicht wiederherstellen — es wird nirgendwo gespeichert.
              </span>
            </div>
          {/if}
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onclick={onBackup} disabled={backupBusy}>
            <Download class="size-4" />
            {backupBusy ? "Sichere…" : "Backup erstellen"}
          </Button>
          <Button type="button" variant="outline" onclick={onPickRestore} disabled={restoreBusy}>
            <Upload class="size-4" />
            Backup auswählen…
          </Button>
        </div>

        {#if pendingRestoreZip}
          <div class="mt-4 rounded-md border border-border bg-muted/30 p-4 space-y-3">
            <div class="text-sm">
              <span class="text-muted-foreground">Quelle:</span>
              <code class="ml-1 break-all">{pendingRestoreZip}</code>
            </div>
            <div class="text-sm font-medium">Welche Bereiche wiederherstellen?</div>
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <Checkbox bind:checked={restoreSectionCustomers} />
                Kunden
              </label>
              <label class="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <Checkbox bind:checked={restoreSectionInvoices} />
                Rechnungen + PDFs <span class="text-muted-foreground">(inkl. Angebote, wiederkehrende Rechnungen)</span>
              </label>
              <label class="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <Checkbox bind:checked={restoreSectionSettings} />
                Einstellungen
              </label>
            </div>
            {#if restoreNeedsPassword}
              <div class="flex flex-col gap-1.5">
                <Label>Passwort des Backups</Label>
                <Input type="password" bind:value={restorePassword} autocomplete="current-password" />
                <span class="text-xs text-muted-foreground">
                  Dieses Backup ist verschlüsselt. Bitte Passwort eingeben und erneut wiederherstellen.
                </span>
              </div>
            {/if}
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                onclick={onRunRestore}
                disabled={restoreBusy || !restoreAnySelected}
              >
                {restoreBusy ? "Stelle wieder her…" : "Wiederherstellen"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onclick={() => (pendingRestoreZip = null)}
                disabled={restoreBusy}
              >
                Abbrechen
              </Button>
              {#if restoreIsFull}
                <span class="text-xs text-muted-foreground">
                  Volle Wiederherstellung — App-Neustart erforderlich.
                </span>
              {:else}
                <span class="text-xs text-muted-foreground">
                  Teil-Wiederherstellung — wird sofort eingespielt.
                </span>
              {/if}
            </div>
          </div>
        {/if}

        <p class="text-xs text-muted-foreground mt-3">
          Bei voller Wiederherstellung wird die gesamte Datenbank ersetzt (alte DB bleibt als
          <code>zettel.db.bak</code> erhalten); bei Teil-Wiederherstellung werden nur die
          gewählten Bereiche aus dem Backup übernommen.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <History class="size-5" />
          Auto-Backup
        </CardTitle>
        <CardDescription>
          Rotierender Wochen-Snapshot in <code>~/Dokumente/Zettel/Backups/auto-&lt;wochentag&gt;.zip</code>.
          Unverschlüsselt, läuft beim App-Start. Im Sandbox-Modus deaktiviert.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="flex flex-col gap-1.5 max-w-md">
          <Label>Intervall</Label>
          <Select
            items={intervalOptions}
            value={autoBackupInterval}
            onValueChange={saveAutoBackup}
            disabled={autoBackupSaving}
          />
        </div>
        <p class="text-xs text-muted-foreground">
          Letzte Ausführung: <strong>{formatLastBackup(lastAutoBackupAt)}</strong>.
          Maximal 7 Slots (ein Slot pro Wochentag) — älteste werden zyklisch
          überschrieben. Für verschlüsselte oder externe Backups nutze „Backup erstellen" oben.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <FlaskConical class="size-5" />
          Sandbox
        </CardTitle>
        <CardDescription>
          Zum gefahrlosen Testen. Daten werden getrennt gespeichert, deine echte Buchhaltung bleibt unberührt. Die App startet beim Umschalten neu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant={sandbox ? "destructive" : "outline"}
          disabled={sandboxBusy}
          onclick={() => requestSandboxToggle(!sandbox)}
        >
          {sandbox ? "Sandbox verlassen" : "Sandbox aktivieren"}
        </Button>
      </CardContent>
    </Card>
  </div>

  <ConfirmDialog
    bind:open={confirmSandboxToggleOpen}
    title={pendingSandbox ? "Sandbox aktivieren?" : "Sandbox verlassen?"}
    description={pendingSandbox
      ? "Die App startet neu. Du wechselst in einen Testbereich – deine echten Daten bleiben unverändert."
      : "Die App startet neu und zeigt wieder deine echte Buchhaltung. Test-Daten bleiben gespeichert."}
    confirmLabel="Neu starten"
    cancelLabel="Abbrechen"
    onConfirm={applySandboxToggle}
  />

  <ConfirmDialog
    bind:open={confirmRestoreOpen}
    title="Backup wiederherstellen?"
    description={`Die aktuelle Datenbank und alle PDFs werden ersetzt. Die alte DB landet als zettel.db.bak im App-Datenverzeichnis. Die App muss anschließend neu gestartet werden.\n\nQuelle: ${pendingRestoreZip ?? ""}`}
    confirmLabel="Wiederherstellen"
    cancelLabel="Abbrechen"
    onConfirm={onConfirmRestore}
  />
</SettingsShell>
