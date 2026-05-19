<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import { open } from "@tauri-apps/plugin-dialog";
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
    Select,
    Checkbox,
    Slider,
    toast,
  } from "$lib/ui";
  import { Image, X, ChevronLeft, ChevronRight } from "@lucide/svelte";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";
  import {
    listPrepayments,
    upsertPrepayment,
    type PrepaymentRow,
    type Quarter,
  } from "$lib/db/tax-prepayments";

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

  let s = $state<Settings | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  let prepaymentYear = $state(new Date().getFullYear());
  let prepayments = $state<PrepaymentRow[]>([]);
  let prepaymentBusy = $state(false);

  async function loadPrepayments(year: number) {
    prepaymentBusy = true;
    try {
      prepayments = await listPrepayments(year);
    } finally {
      prepaymentBusy = false;
    }
  }

  $effect(() => {
    loadPrepayments(prepaymentYear);
  });

  async function savePrepayment(quarter: Quarter, euroStr: string) {
    const cents = eurStringToCents(euroStr);
    await upsertPrepayment(prepaymentYear, quarter, cents);
    await loadPrepayments(prepaymentYear);
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
      .then((row) => (s = row))
      .catch((e) => (error = String(e)))
      .finally(() => (loading = false));
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
</script>

<SettingsShell
  title="Unternehmen"
  description="Stammdaten, die im Briefkopf jeder Rechnung erscheinen."
>
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

            <div class="col-span-2 flex flex-col gap-1.5 border-t pt-4 mt-2">
              <Label>Weitere Jahres-Einkünfte (zu versteuerndes Einkommen, €/Jahr)</Label>
              <Input
                type="text"
                inputmode="decimal"
                value={centsToEur(s.otherIncomeAnnualCent)}
                onblur={(e) => (s!.otherIncomeAnnualCent = eurStringToCents((e.currentTarget as HTMLInputElement).value))}
                class="max-w-xs"
              />
              <p class="text-xs text-muted-foreground">
                Brutto-Jahresgehalt aus Anstellung, Rente, Kapitalerträge oder andere zvE-relevante Einkünfte abseits von Zettel. Die ESt ist progressiv — ohne diesen Wert würde Zettel den Grenzsteuersatz auf deine Selbstständigkeit unterschätzen (Nebenberuf-Bug). Die Rücklage rechnet als <em>Aufschlag</em>: ESt(Gesamt-zvE) minus ESt(nur hier eingetragene Einkünfte) — den Lohnsteuer-Anteil führt dein AG ja bereits ab.
              </p>
            </div>

            <div class="col-span-2 mt-2">
              <div class="flex items-center justify-between mb-1.5">
                <Label>Geleistete ESt-Vorauszahlungen</Label>
                <div class="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onclick={() => (prepaymentYear = prepaymentYear - 1)}
                    disabled={prepaymentBusy}
                    aria-label="Vorjahr"
                  >
                    <ChevronLeft class="size-4" />
                  </Button>
                  <span class="tabular-nums font-medium px-2 min-w-[3.5rem] text-center">
                    {prepaymentYear}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onclick={() => (prepaymentYear = prepaymentYear + 1)}
                    disabled={prepaymentBusy}
                    aria-label="Folgejahr"
                  >
                    <ChevronRight class="size-4" />
                  </Button>
                </div>
              </div>
              <div class="grid grid-cols-4 gap-2">
                {#each prepayments as p (p.quarter)}
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Q{p.quarter}</span>
                    <Input
                      type="text"
                      inputmode="decimal"
                      value={centsToEur(p.amountCent)}
                      disabled={prepaymentBusy}
                      onblur={(e) => savePrepayment(p.quarter, (e.currentTarget as HTMLInputElement).value)}
                    />
                  </div>
                {/each}
              </div>
              <p class="text-xs text-muted-foreground mt-1.5">
                Pro Steuerjahr getrennt. Die Steuer-Rücklage im Dashboard rechnet immer mit den Werten des aktuellen Kalenderjahres ({new Date().getFullYear()}). Andere Jahre kannst du hier zur Historie erfassen — z. B. Folgejahres-Vorauszahlungen aus einem Anpassungsbescheid.
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
                <div class="mt-4 ml-7 space-y-2">
                  <div class="flex items-center justify-between">
                    <Label class="text-xs">Prozentsatz vom Brutto-Umsatz</Label>
                    <span class="text-base font-semibold tabular-nums">{Math.round(s.pauschalTaxPercent)} %</span>
                  </div>
                  <Slider
                    type="single"
                    min={0}
                    max={50}
                    step={1}
                    value={Math.round(s.pauschalTaxPercent)}
                    onValueChange={(v) => (s!.pauschalTaxPercent = typeof v === "number" ? v : v[0])}
                  />
                  <div class="flex justify-between text-[10px] text-muted-foreground tabular-nums">
                    <span>0 %</span>
                    <span>25 %</span>
                    <span>50 %</span>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    Daumenwert für Solo-Selbstständige: <strong>30 %</strong>.
                  </p>
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
          <CardTitle>Logo</CardTitle>
          <CardDescription>Erscheint im Rechnungs-Header.</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col gap-1.5">
            <Label>Logo-Datei</Label>
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
  {/if}
</SettingsShell>
