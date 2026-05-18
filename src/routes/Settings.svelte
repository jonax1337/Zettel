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
    Checkbox,
    toast,
  } from "$lib/ui";
  import { Image, X, Download, Upload, RefreshCw, Check, MonitorCog } from "@lucide/svelte";
  import { version as appVersion } from "../../package.json";
  import { checkForUpdate } from "$lib/updater";
  import { accent, ACCENT_PRESETS, type AccentKey } from "$lib/accent.svelte";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";

  const legalFormItems = [
    { value: "freelancer", label: "Freiberufler (keine Gewerbesteuer)" },
    { value: "trade", label: "Gewerbetreibender" },
  ];
  const filingStatusItems = [
    { value: "single", label: "ledig" },
    { value: "married", label: "verheiratet (Splittingtarif)" },
  ];
  const churchRateItems = [
    { value: "0", label: "keine Kirchensteuer" },
    { value: "0.08", label: "8 % (BY, BW)" },
    { value: "0.09", label: "9 % (übrige Länder)" },
  ];
  import { theme } from "$lib/theme.svelte";

  const accentKeys: AccentKey[] = [
    "system",
    "slate",
    "indigo",
    "violet",
    "rose",
    "emerald",
    "amber",
    "sky",
  ];
  const accentLabel = (k: AccentKey) => (k === "system" ? "System" : ACCENT_PRESETS[k].label);

  // aktueller DB-Schema-Stand (siehe src-tauri/src/lib.rs Migrations-Vektor)
  const CURRENT_DB_SCHEMA_VERSION = 16;

  let s = $state<Settings | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let sandbox = $state(false);
  let sandboxBusy = $state(false);
  let confirmSandboxToggleOpen = $state(false);
  let pendingSandbox = $state(false);

  $effect(() => {
    invoke<boolean>("is_sandbox")
      .then((v) => (sandbox = v))
      .catch(() => {});
  });

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

  const themeItems = [
    { value: "classic", label: "Klassisch" },
    { value: "modern", label: "Modern" },
    { value: "minimal", label: "Minimal" },
  ];

  // --- Backup / Restore ---
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
      // Konsistenter SQLite-Snapshot über die aktive Plugin-Verbindung
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

  // --- Updates ---
  let updateChecking = $state(false);

  async function onCheckUpdate() {
    updateChecking = true;
    try {
      const result = await checkForUpdate();
      if (result.available) {
        toast.action(
          `Update v${result.version} verfügbar`,
          {
            label: "Installieren",
            onClick: () => result.install(),
          },
          { description: "Klick zum Herunterladen und Neustarten." },
        );
      } else {
        toast.success("Bereits aktuell.", `Installierte Version: v${appVersion}`);
      }
    } catch (e) {
      toast.error("Update-Prüfung fehlgeschlagen", String(e));
    } finally {
      updateChecking = false;
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

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Einstellungen</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Firmendaten, Steuer, Rechnungsnummer, Bank.
    </p>
  </div>
  <div class="flex items-center gap-3 text-sm">
    <span class="text-muted-foreground">
      Version <code class="text-foreground">v{appVersion}</code>
    </span>
    <Button
      type="button"
      variant="outline"
      size="sm"
      onclick={onCheckUpdate}
      disabled={updateChecking}
    >
      <RefreshCw class={"size-3.5 " + (updateChecking ? "animate-spin" : "")} />
      {updateChecking ? "Prüfe…" : "Nach Updates suchen"}
    </Button>
  </div>
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
            <Label>Firmenname <span class="text-destructive">*</span></Label>
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
            <Label>Straße & Nr. <span class="text-destructive">*</span></Label>
            <Input bind:value={s.street} required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>PLZ <span class="text-destructive">*</span></Label>
            <Input bind:value={s.postalCode} required />
          </div>
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Ort <span class="text-destructive">*</span></Label>
            <Input bind:value={s.city} required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Land <span class="text-destructive">*</span></Label>
            <Input bind:value={s.country} required maxlength={2} placeholder="DE" />
          </div>
          <p class="col-span-3 text-xs text-muted-foreground -mt-2">
            Pflichtfelder für EN16931-konforme E-Rechnungen. Land als ISO-2-Code.
          </p>
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
            <Label>
              Steuernummer
              {#if !s.vatId}<span class="text-destructive">*</span>{/if}
            </Label>
            <Input bind:value={s.taxNumber} required={!s.vatId} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>
              USt-IdNr.
              {#if !s.taxNumber}<span class="text-destructive">*</span>{/if}
            </Label>
            <Input bind:value={s.vatId} required={!s.taxNumber} />
          </div>
          <p class="col-span-2 text-xs text-muted-foreground -mt-2">
            EN16931 (BR-CO-26) verlangt mindestens eine der beiden Identifikationen.
            Kleinunternehmer:innen geben die Steuernummer an.
          </p>
          <label class="col-span-2 flex items-center gap-2.5 text-sm mt-1 cursor-pointer select-none">
            <Checkbox bind:checked={s.isKleinunternehmer} />
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
        <CardTitle>Steuerprofil</CardTitle>
        <CardDescription>
          Grundlage für die Steuer-Rücklage-Schätzung im Dashboard. Keine Steuerberatung — nur eine Vorhersage zur Liquiditätsplanung.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Rechtsform</Label>
            <Select
              items={legalFormItems}
              value={s.legalForm}
              onValueChange={(v) => (s!.legalForm = v as Settings["legalForm"])}
            />
          </div>

          {#if s.legalForm === "trade"}
            <div class="flex flex-col gap-1.5">
              <Label>Gewerbe-Hebesatz (%)</Label>
              <Input
                type="number"
                min="200"
                max="900"
                step="10"
                value={Math.round(s.tradeTaxRate * 100)}
                oninput={(e) => {
                  const n = Number.parseInt((e.currentTarget as HTMLInputElement).value, 10);
                  if (!Number.isNaN(n)) s!.tradeTaxRate = n / 100;
                }}
              />
              <p class="text-xs text-muted-foreground">
                Hebesatz deiner Gemeinde. Bundesdurchschnitt ~400 %.
              </p>
            </div>
          {/if}

          <div class="flex flex-col gap-1.5">
            <Label>Kirchensteuer</Label>
            <Select
              items={churchRateItems}
              value={String(s.churchTaxRate)}
              onValueChange={(v) => (s!.churchTaxRate = Number.parseFloat(v))}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <Label>Familienstand (Steuer)</Label>
            <Select
              items={filingStatusItems}
              value={s.taxFilingStatus}
              onValueChange={(v) => (s!.taxFilingStatus = v as Settings["taxFilingStatus"])}
            />
          </div>

          <div class="col-span-2 mt-2">
            <Label>Geleistete ESt-Vorauszahlungen ({new Date().getFullYear()})</Label>
            <div class="grid grid-cols-4 gap-2 mt-1.5">
              {#each [
                { key: "estPrepaymentQ1Cent", label: "Q1" },
                { key: "estPrepaymentQ2Cent", label: "Q2" },
                { key: "estPrepaymentQ3Cent", label: "Q3" },
                { key: "estPrepaymentQ4Cent", label: "Q4" },
              ] as q}
                <div class="flex flex-col gap-1">
                  <span class="text-xs text-muted-foreground">{q.label}</span>
                  <Input
                    type="text"
                    inputmode="decimal"
                    value={centsToEur((s as unknown as Record<string, number>)[q.key])}
                    onblur={(e) => {
                      const cents = eurStringToCents((e.currentTarget as HTMLInputElement).value);
                      (s as unknown as Record<string, number>)[q.key] = cents;
                    }}
                  />
                </div>
              {/each}
            </div>
            <p class="text-xs text-muted-foreground mt-1.5">
              Bereits ans Finanzamt überwiesene ESt-Vorauszahlungen. Werden von der empfohlenen Rücklage abgezogen.
            </p>
          </div>

          <div class="col-span-2 border-t pt-4 mt-2">
            <label class="flex items-start gap-2.5 text-sm cursor-pointer select-none">
              <Checkbox bind:checked={s.usePauschalTaxReserve} />
              <span>
                <span class="font-medium">Pauschal-Modus zusätzlich anzeigen</span>
                <span class="block text-xs text-muted-foreground mt-0.5">
                  Statt der detaillierten Tarif-Rechnung einfach „X % vom Umsatz brutto zurücklegen". Wird neben der Detail-Rücklage angezeigt — du entscheidest, welcher Wert dir besser dient.
                </span>
              </span>
            </label>
            {#if s.usePauschalTaxReserve}
              <div class="mt-3 ml-7 flex items-center gap-3">
                <Label class="text-xs">Prozentsatz vom Brutto-Umsatz</Label>
                <div class="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    step="1"
                    value={Math.round(s.pauschalTaxPercent)}
                    oninput={(e) => {
                      const n = Number.parseInt((e.currentTarget as HTMLInputElement).value, 10);
                      if (!Number.isNaN(n)) s!.pauschalTaxPercent = Math.max(0, Math.min(50, n));
                    }}
                    class="w-20"
                  />
                  <span class="text-sm text-muted-foreground">%</span>
                </div>
                <span class="text-xs text-muted-foreground">Daumenwert für Solo-Selbstständige: 30 %.</span>
              </div>
            {/if}
          </div>
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

          <div class="flex flex-col gap-1.5">
            <Label>PDF-Design</Label>
            <Select bind:value={s.pdfTheme} items={themeItems} />
            <span class="text-xs text-muted-foreground">
              Beeinflusst nur die visuelle Darstellung der PDF — das eingebettete ZUGFeRD-XML bleibt unverändert.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Darstellung</CardTitle>
        <CardDescription>
          Akzentfarbe der Oberfläche. Beeinflusst nur die App — Rechnungs-PDFs bleiben unverändert.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex flex-wrap items-center gap-2">
          {#each accentKeys as k (k)}
            {@const active = accent.key === k}
            {@const swatch = k === "system" ? null : ACCENT_PRESETS[k].swatch}
            <button
              type="button"
              onclick={() => accent.set(k, theme.resolved)}
              title={accentLabel(k)}
              class={[
                "group relative grid size-10 place-items-center rounded-full border transition-all duration-150 active:scale-90",
                active
                  ? "border-foreground/60 ring-2 ring-ring/40 ring-offset-2 ring-offset-background"
                  : "border-border hover:border-foreground/40",
              ].join(" ")}
              style={swatch ? `background-color: ${swatch};` : undefined}
              aria-label={accentLabel(k)}
              aria-pressed={active}
            >
              {#if k === "system"}
                <MonitorCog class="size-4 text-muted-foreground" />
              {:else if active}
                <Check class="size-4 text-white drop-shadow-sm" />
              {/if}
            </button>
          {/each}
        </div>
        <p class="text-xs text-muted-foreground mt-3">
          „System" übernimmt deine Windows-Akzentfarbe. Auf macOS/Linux fällt das auf das Standard-Preset zurück, bis Plattform-APIs ergänzt sind.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Sandbox</CardTitle>
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
{/if}
