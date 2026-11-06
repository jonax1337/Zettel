<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import DangerSection from "./DangerSection.svelte";
  import {
    Button,
    Input,
    Label,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Checkbox,
    Dialog,
    toast,
  } from "$lib/ui";
  import { AlertTriangle } from "$lib/brand-icons";
  import { writeSafetyBackup } from "$lib/utils/backup";
  import { isSandboxActive } from "$lib/db/client";
  import {
    resetNumberingCounters,
    wipeAllBusinessData,
    wipeTables,
    WIPEABLE_TABLE_LABELS,
    type WipeableTable,
  } from "$lib/db/danger";
  import {
    DANGER_CONFIRM_WORD,
    dangerActionDescription,
    dangerActionLabel,
    isDangerConfirmed,
    joinTableLabels,
    tableCountLabel,
    type DangerAction,
  } from "./danger-actions";

  const SAFETY_BACKUP_PREFIX = "pre-wipe";
  const wipeableTables = Object.entries(WIPEABLE_TABLE_LABELS) as [WipeableTable, string][];

  let selectedTables = $state<Set<WipeableTable>>(new Set());
  let confirmText = $state("");
  let busy = $state(false);
  let pending = $state<DangerAction | null>(null);
  let sandbox = $state(false);

  $effect(() => {
    isSandboxActive().then((active) => (sandbox = active));
  });

  const confirmed = $derived(isDangerConfirmed(confirmText));

  function startDanger(action: DangerAction) {
    pending = action;
    confirmText = "";
  }

  function cancelDanger() {
    if (busy) return;
    pending = null;
    confirmText = "";
  }

  function toggleTable(table: WipeableTable) {
    const next = new Set(selectedTables);
    if (next.has(table)) next.delete(table);
    else next.add(table);
    selectedTables = next;
  }

  /** Runs the action and returns the success message to show. */
  async function performDangerAction(action: DangerAction): Promise<string> {
    switch (action.kind) {
      case "wipeAll":
        await wipeAllBusinessData();
        return "Alle Geschäftsdaten gelöscht.";
      case "wipeTables":
        await wipeTables(action.tables);
        return `Geleert: ${joinTableLabels(action.tables, WIPEABLE_TABLE_LABELS)}`;
      case "resetCounters":
        await resetNumberingCounters();
        return "Nummernzähler zurückgesetzt.";
    }
  }

  async function executeDanger() {
    const action = pending;
    if (!action || !confirmed || busy) return;
    busy = true;
    let phase: string = "backup";
    try {
      const backupPath = await writeSafetyBackup(SAFETY_BACKUP_PREFIX);
      toast.success("Sicherheits-Backup angelegt", backupPath);
      phase = action.kind;
      toast.success(await performDangerAction(action));
      selectedTables = new Set();
      busy = false;
      cancelDanger();
    } catch (e) {
      console.error(`[danger:${phase}]`, e);
      toast.error(`Fehlgeschlagen (Phase: ${phase})`, String(e));
    } finally {
      busy = false;
    }
  }
</script>

<SettingsShell
  title="Erweitert"
  description="Gefahrenbereich — irreversible Aktionen auf den Geschäftsdaten."
>
  <Card class="border-destructive/40">
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-destructive">
        <AlertTriangle class="size-5" />
        Gefahrenbereich
      </CardTitle>
      <CardDescription>
        Irreversible Aktionen. Vor jeder Ausführung wird automatisch ein unverschlüsseltes
        Backup <code>pre-wipe-…zip</code> in den Backup-Ordner der aktiven Datenbank geschrieben
        (z. B. <code>Dokumente/Zettel/Backups/</code>). Das Änderungsprotokoll und die
        Rechnungssiegel werden nie gelöscht: Ausgestellte Rechnungen bleiben im Protokoll
        erhalten, die Integritätsprüfung meldet sie nach dem Löschen als gelöscht.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-6">
      <DangerSection title="Alle Geschäftsdaten löschen">
        {#snippet description()}
          Rechnungen, Angebote, Mahnungen, Ausgaben, Kunden, Lieferanten, wiederkehrende
          Rechnungen & Vorauszahlungen — Einstellungen (Firma, Steuerprofil, Logo) bleiben.
        {/snippet}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy}
          onclick={() => startDanger({ kind: "wipeAll" })}
        >
          Alle Geschäftsdaten löschen…
        </Button>
      </DangerSection>

      <DangerSection title="Einzelne Tabellen leeren">
        {#snippet description()}
          Wähle gezielt, was gelöscht wird. Abhängige Daten (Positionen, Mahnungen)
          werden automatisch mitgelöscht.
        {/snippet}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {#each wipeableTables as [table, label] (table)}
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={selectedTables.has(table)}
                onCheckedChange={() => toggleTable(table)}
              />
              {label}
            </label>
          {/each}
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy || selectedTables.size === 0}
          onclick={() => startDanger({ kind: "wipeTables", tables: Array.from(selectedTables) })}
        >
          {selectedTables.size === 0
            ? "Tabellen leeren…"
            : `${tableCountLabel(selectedTables.size)} leeren…`}
        </Button>
      </DangerSection>

      <DangerSection title="Nummernzähler zurücksetzen">
        {#snippet description()}
          Setzt die Zähler für Rechnung / Angebot / Ausgabe / Mahnung / Lieferant
          auf 0. Sinnvoll <strong>nur</strong> nach einem vorherigen Tabellen-Wipe.
          Bestehende Nummern bleiben unverändert — neue Datensätze starten dann
          wieder bei 0001.
        {/snippet}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy}
          onclick={() => startDanger({ kind: "resetCounters" })}
        >
          Zähler zurücksetzen…
        </Button>
      </DangerSection>
    </CardContent>
  </Card>

  <Dialog
    open={pending !== null}
    onOpenChange={(isOpen) => {
      if (!isOpen) cancelDanger();
    }}
    title={pending ? dangerActionLabel(pending) : ""}
    dismissible={!busy}
  >
    <div class="space-y-4">
      <p class="text-sm text-muted-foreground">
        {pending ? dangerActionDescription(pending, WIPEABLE_TABLE_LABELS) : ""}
      </p>
      <div class="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
        <strong>Irreversibel.</strong> Vor der Ausführung wird ein unverschlüsseltes
        Backup im Backup-Ordner der aktiven Datenbank (oder dem App-Datenordner als Fallback) angelegt — damit bleibt
        ein Rettungsanker, falls du dich vertippt hast.
      </div>
      <p class="text-sm font-medium">
        {sandbox
          ? "Sandbox aktiv: Es werden nur die Testdaten der Sandbox gelöscht."
          : "Keine Sandbox: Es werden deine echten Daten gelöscht."}
      </p>
      <div class="space-y-1.5">
        <Label for="dangerConfirm">Zum Bestätigen <code>{DANGER_CONFIRM_WORD}</code> tippen:</Label>
        <Input
          id="dangerConfirm"
          bind:value={confirmText}
          placeholder={DANGER_CONFIRM_WORD}
          autocomplete="off"
          spellcheck={false}
        />
      </div>
    </div>
    {#snippet footer()}
      <Button variant="outline" onclick={cancelDanger} disabled={busy}>
        Abbrechen
      </Button>
      <Button
        variant="destructive"
        onclick={executeDanger}
        disabled={!confirmed || busy}
      >
        {busy ? "Lösche…" : "Endgültig löschen"}
      </Button>
    {/snippet}
  </Dialog>
</SettingsShell>
