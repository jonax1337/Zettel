<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import { loadSettings } from "$lib/db/queries";
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
  import { AlertTriangle } from "@lucide/svelte";
  import {
    autoBackupBeforeWipe,
    resetNumberingCounters,
    wipeAllBusinessData,
    wipeTables,
    WIPEABLE_TABLE_LABELS,
    type WipeableTable,
  } from "$lib/db/danger";

  const CURRENT_DB_SCHEMA_VERSION = 26;

  type DangerAction =
    | { kind: "wipeAll" }
    | { kind: "wipeTables"; tables: WipeableTable[] }
    | { kind: "resetCounters" };

  let dangerSelectedTables = $state<Set<WipeableTable>>(new Set());
  let dangerConfirmText = $state("");
  let dangerBusy = $state(false);
  let dangerPending = $state<DangerAction | null>(null);

  const dangerConfirmValid = $derived(dangerConfirmText.trim() === "LÖSCHEN");

  function dangerActionLabel(a: DangerAction): string {
    if (a.kind === "wipeAll") return "Alle Geschäftsdaten löschen";
    if (a.kind === "resetCounters") return "Nummerierungs-Counter zurücksetzen";
    return `${a.tables.length} Tabelle${a.tables.length === 1 ? "" : "n"} leeren`;
  }

  function dangerActionDescription(a: DangerAction): string {
    if (a.kind === "wipeAll") {
      return "Rechnungen, Angebote, Mahnungen, Ausgaben, Kunden, Lieferanten, wiederkehrende Rechnungen und Steuer-Vorauszahlungen werden gelöscht. Settings (Firma, Steuerprofil, Logo, Counter-Stand) bleiben.";
    }
    if (a.kind === "resetCounters") {
      return "Counter für Rechnungs-/Angebots-/Ausgaben-/Mahnungs-/Lieferanten-Nummern springen auf 0. Bestehende Datensätze bleiben unangetastet — passt nur zum Stand wenn du vorher die Tabellen geleert hast.";
    }
    const labels = a.tables.map((t) => WIPEABLE_TABLE_LABELS[t]).join(", ");
    return `Die folgenden Daten werden gelöscht: ${labels}. Verknüpfte Datensätze (z. B. Positionen, abhängige Mahnungen) werden automatisch mitgelöscht.`;
  }

  function startDanger(a: DangerAction) {
    dangerPending = a;
    dangerConfirmText = "";
  }

  function cancelDanger() {
    dangerPending = null;
    dangerConfirmText = "";
  }

  async function executeDanger() {
    if (!dangerPending || !dangerConfirmValid || dangerBusy) return;
    dangerBusy = true;
    let phase = "init";
    try {
      phase = "backup";
      const backupPath = await autoBackupBeforeWipe(CURRENT_DB_SCHEMA_VERSION);
      toast.success("Sicherheits-Backup angelegt", backupPath);
      const a = dangerPending;
      if (a.kind === "wipeAll") {
        phase = "wipeAll";
        await wipeAllBusinessData();
        toast.success("Alle Geschäftsdaten gelöscht.");
      } else if (a.kind === "wipeTables") {
        phase = "wipeTables";
        await wipeTables(a.tables);
        toast.success(
          `Geleert: ${a.tables.map((t) => WIPEABLE_TABLE_LABELS[t]).join(", ")}`,
        );
      } else {
        phase = "resetCounters";
        await resetNumberingCounters();
        toast.success("Counter zurückgesetzt.");
        await loadSettings();
      }
      dangerSelectedTables = new Set();
      dangerPending = null;
      dangerConfirmText = "";
    } catch (e) {
      console.error(`[danger:${phase}]`, e);
      toast.error(`Fehlgeschlagen (Phase: ${phase})`, String(e));
    } finally {
      dangerBusy = false;
    }
  }

  function toggleDangerTable(t: WipeableTable) {
    const next = new Set(dangerSelectedTables);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    dangerSelectedTables = next;
  }
</script>

<SettingsShell
  title="Erweitert"
  description="Gefahrenzone — irreversible Aktionen auf den Geschäftsdaten."
>
  <Card class="border-destructive/40">
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-destructive">
        <AlertTriangle class="size-5" />
        Danger Zone
      </CardTitle>
      <CardDescription>
        Irreversible Aktionen. Vor jeder Ausführung wird automatisch ein unverschlüsseltes
        Backup nach <code>~/Dokumente/Zettel/Backups/pre-wipe-…zip</code> geschrieben.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-6">
      <div class="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <div>
          <h3 class="text-sm font-semibold">Alle Geschäftsdaten löschen</h3>
          <p class="text-xs text-muted-foreground mt-0.5">
            Rechnungen, Angebote, Mahnungen, Ausgaben, Kunden, Lieferanten, Recurring &
            Vorauszahlungen — Settings (Firma, Steuerprofil, Logo) bleiben.
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={dangerBusy}
          onclick={() => startDanger({ kind: "wipeAll" })}
        >
          Alle Geschäftsdaten löschen…
        </Button>
      </div>

      <div class="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <div>
          <h3 class="text-sm font-semibold">Einzelne Tabellen leeren</h3>
          <p class="text-xs text-muted-foreground mt-0.5">
            Wähle gezielt, was gelöscht wird. Abhängige Daten (Positionen, Mahnungen)
            werden automatisch mitgelöscht.
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {#each Object.entries(WIPEABLE_TABLE_LABELS) as [table, label] (table)}
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={dangerSelectedTables.has(table as WipeableTable)}
                onCheckedChange={() => toggleDangerTable(table as WipeableTable)}
              />
              {label}
            </label>
          {/each}
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={dangerBusy || dangerSelectedTables.size === 0}
          onclick={() =>
            startDanger({
              kind: "wipeTables",
              tables: Array.from(dangerSelectedTables),
            })}
        >
          {dangerSelectedTables.size === 0
            ? "Tabellen leeren…"
            : `${dangerSelectedTables.size} Tabelle${dangerSelectedTables.size === 1 ? "" : "n"} leeren…`}
        </Button>
      </div>

      <div class="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <div>
          <h3 class="text-sm font-semibold">Nummerierungs-Counter zurücksetzen</h3>
          <p class="text-xs text-muted-foreground mt-0.5">
            Setzt die Counter für Rechnung / Angebot / Ausgabe / Mahnung / Lieferant
            auf 0. Sinnvoll <strong>nur</strong> nach einem vorherigen Tabellen-Wipe.
            Bestehende Nummern bleiben unverändert — neue Datensätze starten dann
            wieder bei 0001.
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={dangerBusy}
          onclick={() => startDanger({ kind: "resetCounters" })}
        >
          Counter zurücksetzen…
        </Button>
      </div>
    </CardContent>
  </Card>

  <Dialog
    open={dangerPending !== null}
    onOpenChange={(o) => {
      if (!o) cancelDanger();
    }}
    title={dangerPending ? dangerActionLabel(dangerPending) : ""}
  >
    <div class="space-y-4">
      <p class="text-sm text-muted-foreground">
        {dangerPending ? dangerActionDescription(dangerPending) : ""}
      </p>
      <div class="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
        <strong>Irreversibel.</strong> Vor der Ausführung wird ein unverschlüsseltes
        Backup unter <code>Dokumente/Zettel/Backups/</code> (oder dem App-Datenordner als Fallback) angelegt — damit bleibt
        ein Rettungsanker, falls du dich vertippt hast.
      </div>
      <div class="space-y-1.5">
        <Label for="dangerConfirm">Zum Bestätigen <code>LÖSCHEN</code> tippen:</Label>
        <Input
          id="dangerConfirm"
          bind:value={dangerConfirmText}
          placeholder="LÖSCHEN"
          autocomplete="off"
          spellcheck={false}
        />
      </div>
    </div>
    {#snippet footer()}
      <Button variant="outline" onclick={cancelDanger} disabled={dangerBusy}>
        Abbrechen
      </Button>
      <Button
        variant="destructive"
        onclick={executeDanger}
        disabled={!dangerConfirmValid || dangerBusy}
      >
        {dangerBusy ? "Lösche…" : "Endgültig löschen"}
      </Button>
    {/snippet}
  </Dialog>
</SettingsShell>
