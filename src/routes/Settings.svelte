<script lang="ts">
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { execute } from "$lib/db/client";
  import { loadSettings, saveSettings } from "$lib/db/queries";
  import type { Settings } from "$lib/db/schema";
  import {
    Button,
    Input,
    Textarea,
    Label,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    ConfirmDialog,
    Select,
    toast,
  } from "$lib/ui";
  import { Image, X, Download, Upload } from "@lucide/svelte";

  // aktueller DB-Schema-Stand (siehe src-tauri/src/lib.rs Migrations-Vektor)
  const CURRENT_DB_SCHEMA_VERSION = 7;

  let s = $state<Settings | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  async function pickLogo() {
    if (!s) return;
    const picked = await open({
      multiple: false,
      filters: [{ name: "Bilder", extensions: ["png", "jpg", "jpeg", "svg"] }],
    });
    if (typeof picked === "string") s.logoPath = picked;
  }

  $effect(() => {
    loadSettings()
      .then((row) => {
        s = row;
      })
      .catch((e) => {
        error = String(e);
      })
      .finally(() => {
        loading = false;
      });
  });

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!s) return;
    saving = true;
    error = null;
    try {
      await saveSettings(s);
      toast.success("Einstellungen gespeichert");
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  const profileItems = [
    { value: "en16931", label: "EN 16931 / Comfort (Standard)" },
    { value: "basic", label: "BASIC (Factur-X 1.0)" },
    { value: "extended", label: "EXTENDED (Factur-X 1.0)" },
  ];

  // --- Backup / Restore ---
  let backupBusy = $state(false);
  let restoreBusy = $state(false);
  let confirmRestoreOpen = $state(false);
  let pendingRestoreZip = $state<string | null>(null);
  let restoreSectionCustomers = $state(true);
  let restoreSectionInvoices = $state(true);
  let restoreSectionSettings = $state(true);
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
    backupBusy = true;
    try {
      const target = await save({
        defaultPath: defaultBackupFilename(),
        filters: [{ name: "Zettel Backup", extensions: ["zip"] }],
      });
      if (!target) return;
      // Konsistenter SQLite-Snapshot über die aktive Plugin-Verbindung
      const snapshotPath = await invoke<string>("snapshot_db_path");
      await execute(`VACUUM INTO ?`, [snapshotPath]);
      await invoke<string>("bundle_backup", {
        snapshotPath,
        targetZip: target,
        invoiceCount: null,
        dbSchemaVersion: CURRENT_DB_SCHEMA_VERSION,
      });
      toast.success("Backup gespeichert", target);
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
      });
      await invoke<void>("apply_pending_partial_restore");
      toast.success(
        "Wiederherstellung abgeschlossen",
        "Die ausgewählten Bereiche wurden eingespielt.",
      );
      pendingRestoreZip = null;
    } catch (e) {
      toast.error("Wiederherstellung fehlgeschlagen", String(e));
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
      });
      toast.success(
        "Wiederherstellung vorbereitet",
        "Bitte die App neu starten — das Backup wird beim nächsten Start eingespielt.",
      );
    } catch (e) {
      toast.error("Wiederherstellung fehlgeschlagen", String(e));
    } finally {
      restoreBusy = false;
      pendingRestoreZip = null;
    }
  }
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Einstellungen</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Firmendaten, Steuer, Rechnungsnummer, Bank.
  </p>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if error && !s}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if s}
  <form onsubmit={onSubmit} class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Firma</CardTitle>
        <CardDescription>Erscheint im Briefkopf jeder Rechnung.</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Firmenname</Label>
            <Input bind:value={s.companyName} required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Inhaber:in</Label>
            <Input bind:value={s.ownerName} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>E-Mail</Label>
            <Input type="email" bind:value={s.email} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Telefon</Label>
            <Input bind:value={s.phone} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Website</Label>
            <Input bind:value={s.website} />
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Adresse</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-4">
          <div class="col-span-3 flex flex-col gap-1.5">
            <Label>Straße & Nr.</Label>
            <Input bind:value={s.street} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>PLZ</Label>
            <Input bind:value={s.postalCode} />
          </div>
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Ort</Label>
            <Input bind:value={s.city} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Land</Label>
            <Input bind:value={s.country} />
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Steuer</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <Label>Steuernummer</Label>
            <Input bind:value={s.taxNumber} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>USt-IdNr. (optional)</Label>
            <Input bind:value={s.vatId} />
          </div>
          <label class="col-span-2 flex items-center gap-2.5 text-sm mt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              bind:checked={s.isKleinunternehmer}
              class="size-4 rounded border-border accent-primary"
            />
            Kleinunternehmer:in nach §19 UStG (keine USt-Ausweisung)
          </label>
          {#if s.isKleinunternehmer}
            <div class="col-span-2 flex flex-col gap-1.5">
              <Label>§19-Hinweistext</Label>
              <Textarea rows={2} bind:value={s.kleinunternehmerNote} />
            </div>
          {/if}
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Bank</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Bank</Label>
            <Input bind:value={s.bankName} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>IBAN</Label>
            <Input bind:value={s.bankIban} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>BIC</Label>
            <Input bind:value={s.bankBic} />
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Rechnungen</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <Label>Nummern-Format</Label>
            <Input bind:value={s.invoiceNumberFormat} />
            <span class="text-xs text-muted-foreground">
              Platzhalter: {"{YYYY}"}, {"{NNNN}"}
            </span>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Aktueller Zähler</Label>
            <Input type="number" min="0" bind:value={s.invoiceNumberCounter} />
          </div>
          <div class="flex flex-col gap-1.5 col-span-2">
            <Label>Standard-Zahlungsfrist (Tage)</Label>
            <Input type="number" min="0" bind:value={s.defaultPaymentTermsDays} />
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Angebote</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <Label>Nummern-Format</Label>
            <Input bind:value={s.offerNumberFormat} />
            <span class="text-xs text-muted-foreground">
              Platzhalter: {"{YYYY}"}, {"{NNNN}"}
            </span>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Aktueller Zähler</Label>
            <Input type="number" min="0" bind:value={s.offerNumberCounter} />
          </div>
          <div class="flex flex-col gap-1.5 col-span-2">
            <Label>Standard-Gültigkeit (Tage)</Label>
            <Input type="number" min="1" bind:value={s.defaultOfferValidityDays} />
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Logo & E-Rechnung</CardTitle>
        <CardDescription>
          Logo erscheint im Rechnungs-Header. ZUGFeRD-Profil bestimmt das eingebettete XML-Format.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 gap-4">
          <div class="flex flex-col gap-1.5">
            <Label>Logo</Label>
            <div class="flex items-center gap-2">
              <Input
                bind:value={s.logoPath}
                placeholder="Kein Logo ausgewählt"
                class="flex-1"
              />
              <Button type="button" variant="outline" onclick={pickLogo}>
                <Image />
                Wählen…
              </Button>
              {#if s.logoPath}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onclick={() => s && (s.logoPath = null)}
                  aria-label="Logo entfernen"
                >
                  <X />
                </Button>
              {/if}
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label>ZUGFeRD-Profil</Label>
            <Select bind:value={s.zugferdProfile} items={profileItems} />
            <span class="text-xs text-muted-foreground">
              EN 16931 deckt alle B2B-Standardfälle ab und ist als E-Rechnung universell akzeptiert.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Backup & Wiederherstellung</CardTitle>
        <CardDescription>
          Sichert die Datenbank und alle erzeugten Rechnungs-PDFs in eine ZIP-Datei.
          Wiederhergestellte Backups werden beim nächsten App-Start eingespielt.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                <input
                  type="checkbox"
                  bind:checked={restoreSectionCustomers}
                  class="size-4 rounded border-border accent-primary"
                />
                Kunden
              </label>
              <label class="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  bind:checked={restoreSectionInvoices}
                  class="size-4 rounded border-border accent-primary"
                />
                Rechnungen + PDFs <span class="text-muted-foreground">(inkl. Angebote, wiederkehrende Rechnungen)</span>
              </label>
              <label class="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  bind:checked={restoreSectionSettings}
                  class="size-4 rounded border-border accent-primary"
                />
                Einstellungen
              </label>
            </div>
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

    <div class="flex items-center gap-3">
      <Button type="submit" disabled={saving}>
        {saving ? "Speichere…" : "Speichern"}
      </Button>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>

  <ConfirmDialog
    bind:open={confirmRestoreOpen}
    title="Backup wiederherstellen?"
    description={`Die aktuelle Datenbank und alle PDFs werden ersetzt. Die alte DB landet als zettel.db.bak im App-Datenverzeichnis. Die App muss anschließend neu gestartet werden.\n\nQuelle: ${pendingRestoreZip ?? ""}`}
    confirmLabel="Wiederherstellen"
    cancelLabel="Abbrechen"
    onConfirm={onConfirmRestore}
  />
{/if}
