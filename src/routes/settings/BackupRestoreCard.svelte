<script lang="ts">
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { writeBackupZip, writeSafetyBackup } from "$lib/utils/backup";
  import { relaunchApp } from "$lib/utils/relaunch";
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
    toast,
    PERSISTENT_TOAST,
  } from "$lib/ui";
  import { Download, Upload } from "$lib/brand-icons";
  import { pluralize } from "../parts/entity/format";
  import {
    BACKUP_PASSWORD_MIN_LENGTH,
    backupPasswordProblem,
    defaultBackupFilename,
    isPasswordRequiredError,
  } from "./backup-form";

  type RestoreOutcome = "done" | "needsPassword" | "failed";
  /** `sealsFromBackup` is null when the invoice section was not restored; `droppedLiveSeals` is then 0. */
  type PartialRestoreOutcome = { sealsFromBackup: boolean | null; droppedLiveSeals: number };

  const NO_SEALS_IN_BACKUP_TEXT =
    "Die Sicherung enthält noch keine Rechnungssiegel (ältere Version). Die wiederhergestellten Rechnungen werden beim nächsten Start neu versiegelt – bitte danach die Integritätsprüfung unter Einstellungen → Daten ausführen.";

  function droppedSealsText(count: number): string {
    return `${count} ${pluralize(count, "Rechnungssiegel", "Rechnungssiegel")} aus der Zeit nach dieser Sicherung ${pluralize(count, "wurde", "wurden")} verworfen – die zugehörigen Rechnungen ${pluralize(count, "ist", "sind")} nicht mehr vorhanden. Der Vorgang ist im Änderungsprotokoll vermerkt.`;
  }

  /** One warning for everything the restore did to the seals, so two toasts never contradict each other. */
  function sealWarning({ sealsFromBackup, droppedLiveSeals }: PartialRestoreOutcome): { title: string; description: string } | null {
    const texts = [
      droppedLiveSeals > 0 ? droppedSealsText(droppedLiveSeals) : null,
      sealsFromBackup === false ? NO_SEALS_IN_BACKUP_TEXT : null,
    ].filter((text) => text !== null);
    if (texts.length === 0) return null;
    return {
      title: droppedLiveSeals > 0 ? "Rechnungssiegel verworfen" : "Rechnungen ohne Siegel wiederhergestellt",
      description: texts.join(" "),
    };
  }

  const BACKUP_FILE_FILTER = [{ name: "Zettel Backup", extensions: ["zip"] }];
  const SAFETY_BACKUP_PREFIX = "pre-restore";

  let backupBusy = $state(false);
  let backupEncrypt = $state(false);
  let backupPassword = $state("");
  let backupPasswordConfirm = $state("");

  let restoreBusy = $state(false);
  let confirmFullRestoreOpen = $state(false);
  let confirmPartialRestoreOpen = $state(false);
  let restartPending = $state(false);
  let pendingRestoreZip = $state<string | null>(null);
  let restoreSections = $state({ customers: true, invoices: true, settings: true });
  let restorePassword = $state("");
  let restoreNeedsPassword = $state(false);

  const restoreIsFull = $derived(Object.values(restoreSections).every(Boolean));
  const restoreAnySelected = $derived(Object.values(restoreSections).some(Boolean));

  async function onBackup() {
    if (backupEncrypt) {
      const problem = backupPasswordProblem(backupPassword, backupPasswordConfirm);
      if (problem) {
        toast.error(problem.title, problem.description);
        return;
      }
    }
    backupBusy = true;
    try {
      const target = await save({
        defaultPath: defaultBackupFilename(new Date()),
        filters: BACKUP_FILE_FILTER,
      });
      if (!target) return;
      await writeBackupZip(target, backupEncrypt ? backupPassword : null);
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
    const picked = await open({ multiple: false, filters: BACKUP_FILE_FILTER });
    if (typeof picked !== "string") return;
    pendingRestoreZip = picked;
    restoreSections = { customers: true, invoices: true, settings: true };
    restoreNeedsPassword = false;
    restorePassword = "";
  }

  function stageRestore(sections: typeof restoreSections | null) {
    return invoke<string>("stage_restore", {
      sourceZip: pendingRestoreZip,
      sections,
      password: restorePassword || null,
    });
  }

  async function attemptRestore(restore: () => Promise<void>): Promise<RestoreOutcome> {
    restoreBusy = true;
    try {
      await restore();
      pendingRestoreZip = null;
      restorePassword = "";
      restoreNeedsPassword = false;
      return "done";
    } catch (e) {
      if (isPasswordRequiredError(e)) {
        restoreNeedsPassword = true;
        toast.error("Passwort erforderlich", "Dieses Backup ist verschlüsselt.");
        return "needsPassword";
      }
      toast.error("Wiederherstellung fehlgeschlagen", String(e));
      return "failed";
    } finally {
      restoreBusy = false;
    }
  }

  async function onRunRestore() {
    if (!pendingRestoreZip) return;
    if (!restoreAnySelected) {
      toast.error("Nichts ausgewählt", "Bitte mindestens einen Bereich wählen.");
      return;
    }
    if (restoreIsFull) {
      confirmFullRestoreOpen = true;
    } else {
      confirmPartialRestoreOpen = true;
    }
  }

  async function onConfirmPartialRestore() {
    if (!pendingRestoreZip) return;
    let safetyBackup = "";
    let restored = null as PartialRestoreOutcome | null;
    const outcome = await attemptRestore(async () => {
      // Staging first: it rejects a wrong or missing password before any
      // safety backup gets written.
      await stageRestore(restoreSections);
      try {
        safetyBackup = await writeSafetyBackup(SAFETY_BACKUP_PREFIX);
      } catch (e) {
        await invoke<void>("discard_pending_restore");
        throw new Error(`Sicherheits-Backup fehlgeschlagen, nichts wurde verändert: ${e}`);
      }
      restored = await invoke<PartialRestoreOutcome>("apply_pending_partial_restore");
    });
    if (outcome === "done") {
      toast.success(
        "Wiederherstellung abgeschlossen",
        `Die ausgewählten Bereiche wurden eingespielt. Der vorherige Stand liegt in ${safetyBackup}.`,
      );
      const warning = restored && sealWarning(restored);
      if (warning) {
        toast.show(warning.title, {
          description: warning.description,
          variant: "warning",
          duration: PERSISTENT_TOAST,
        });
      }
    }
  }

  async function onConfirmFullRestore() {
    if (!pendingRestoreZip) return;
    const outcome = await attemptRestore(async () => {
      await stageRestore(null);
    });
    if (outcome === "done") {
      restartPending = true;
      toast.action(
        "Wiederherstellung vorbereitet",
        { label: "Jetzt neu starten", onClick: restartNow },
        {
          description: "Das Backup wird beim nächsten Start der App eingespielt.",
          duration: PERSISTENT_TOAST,
        },
      );
    } else if (outcome === "failed") {
      pendingRestoreZip = null;
    }
  }

  async function restartNow() {
    try {
      await relaunchApp();
    } catch (e) {
      toast.error("Neustart fehlgeschlagen", `Bitte die App von Hand neu starten. ${e}`);
    }
  }
</script>

<Card>
  <CardHeader>
    <CardTitle>Backup & Wiederherstellung</CardTitle>
    <CardDescription>
      Sichert die Datenbank und alle PDFs (Rechnungen, Angebote, Mahnungen, Eingangsrechnungen)
      in eine ZIP-Datei. Wiederhergestellte Backups werden beim nächsten App-Start eingespielt.
    </CardDescription>
  </CardHeader>
  <CardContent>
    {#if restartPending}
      <div class="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
        <span class="flex-1">Die Wiederherstellung ist vorbereitet und wird beim nächsten Start eingespielt.</span>
        <Button type="button" onclick={restartNow}>Jetzt neu starten</Button>
      </div>
    {/if}
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
            Mindestens {BACKUP_PASSWORD_MIN_LENGTH} Zeichen. Ohne dieses Passwort lässt sich das Backup nicht wiederherstellen — es wird nirgendwo gespeichert.
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
            <Checkbox bind:checked={restoreSections.customers} />
            Kunden
          </label>
          <label class="flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <Checkbox bind:checked={restoreSections.invoices} />
            Rechnungen + PDFs <span class="text-muted-foreground">(inkl. Zahlungen, Mahnungen, Anhänge, Angebote, wiederkehrende Rechnungen)</span>
          </label>
          <label class="flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <Checkbox bind:checked={restoreSections.settings} />
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
          <span class="text-xs text-muted-foreground">
            {restoreIsFull
              ? "Volle Wiederherstellung — App-Neustart erforderlich."
              : "Teil-Wiederherstellung — wird nach einem Sicherheits-Backup sofort eingespielt."}
          </span>
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

<ConfirmDialog
  bind:open={confirmFullRestoreOpen}
  title="Backup wiederherstellen?"
  description={`Die aktuelle Datenbank und alle PDFs werden ersetzt. Die alte DB landet als zettel.db.bak im App-Datenverzeichnis. Die App muss anschließend neu gestartet werden.\n\nQuelle: ${pendingRestoreZip ?? ""}`}
  confirmLabel="Wiederherstellen"
  cancelLabel="Abbrechen"
  onConfirm={onConfirmFullRestore}
/>

<ConfirmDialog
  bind:open={confirmPartialRestoreOpen}
  title="Bereiche wiederherstellen?"
  description={`Die ausgewählten Bereiche werden durch den Stand aus dem Backup ersetzt — Änderungen seit dem Backup gehen in diesen Bereichen verloren. Vorher wird automatisch ein Sicherheits-Backup im Backup-Ordner angelegt.\n\nQuelle: ${pendingRestoreZip ?? ""}`}
  confirmLabel="Wiederherstellen"
  cancelLabel="Abbrechen"
  onConfirm={onConfirmPartialRestore}
/>
