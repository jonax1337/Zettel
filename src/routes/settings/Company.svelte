<script lang="ts">
  import { onMount } from "svelte";
  import SettingsShell from "./SettingsShell.svelte";
  import SettingsFormFooter from "./SettingsFormFooter.svelte";
  import PrepaymentsEditor from "./PrepaymentsEditor.svelte";
  import PauschalReserveField from "./PauschalReserveField.svelte";
  import LogoField from "./LogoField.svelte";
  import { SettingsForm } from "./settings-form.svelte";
  import type { Settings } from "$lib/db/schema";
  import {
    Input,
    IbanInput,
    Textarea,
    Label,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Select,
    Checkbox,
  } from "$lib/ui";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";

  type Choice<T> = { value: T; label: string }[];

  const legalFormItems: Choice<Settings["legalForm"]> = [
    { value: "freelancer", label: "Freiberufler (keine Gewerbesteuer)" },
    { value: "trade", label: "Gewerbetreibender" },
  ];
  const filingStatusItems: Choice<Settings["taxFilingStatus"]> = [
    { value: "single", label: "ledig" },
    { value: "married", label: "verheiratet (Splittingtarif)" },
  ];
  const vatAccountingItems: Choice<Settings["vatAccounting"]> = [
    { value: "accrual", label: "Soll-Versteuerung (nach Rechnungsdatum, Standard)" },
    { value: "cash", label: "Ist-Versteuerung (nach Zahlungseingang, § 20 UStG)" },
  ];
  const churchRateItems: Choice<string> = [
    { value: "0", label: "keine Kirchensteuer" },
    { value: "0.08", label: "8 % (BY, BW)" },
    { value: "0.09", label: "9 % (übrige Länder)" },
  ];

  const form = new SettingsForm();
  onMount(() => form.load());
</script>

<SettingsShell
  title="Unternehmen"
  description="Stammdaten, die im Briefkopf jeder Rechnung erscheinen."
>
  {#if form.loading}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else if form.error && !form.settings}
    <p class="text-sm text-destructive">Fehler: {form.error}</p>
  {:else if form.settings}
    {@const s = form.settings}
    <form onsubmit={(e) => form.submit(e)} class="space-y-6">
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
          <CardTitle>Handelsregister</CardTitle>
          <CardDescription>
            Pflichtangaben für GmbH/UG auf Rechnungen (§ 35a GmbHG). Für Einzelunternehmen leer lassen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1.5">
              <Label>Registergericht</Label>
              <Input bind:value={s.registerCourt} placeholder="Amtsgericht Berlin-Charlottenburg" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>Registernummer</Label>
              <Input bind:value={s.registerNumber} placeholder="HRB 123456 B" />
            </div>
            <div class="col-span-2 flex flex-col gap-1.5">
              <Label>Geschäftsführung</Label>
              <Input bind:value={s.managingDirectors} placeholder="Erika Mustermann" />
            </div>
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
              <Select items={legalFormItems} bind:value={s.legalForm} />
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
                    const n = Number.parseInt(e.currentTarget.value, 10);
                    if (!Number.isNaN(n)) s.tradeTaxRate = n / 100;
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
                onValueChange={(v) => (s.churchTaxRate = Number.parseFloat(v))}
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <Label>Familienstand (Steuer)</Label>
              <Select items={filingStatusItems} bind:value={s.taxFilingStatus} />
            </div>

            <div class="col-span-2 flex flex-col gap-1.5 border-t pt-4 mt-2">
              <Label>Weitere Jahres-Einkünfte (zu versteuerndes Einkommen, €/Jahr)</Label>
              <Input
                type="text"
                inputmode="decimal"
                value={centsToEur(s.otherIncomeAnnualCent)}
                onblur={(e) => (s.otherIncomeAnnualCent = eurStringToCents(e.currentTarget.value))}
                class="max-w-xs"
              />
              <p class="text-xs text-muted-foreground">
                Brutto-Jahresgehalt aus Anstellung, Rente, Kapitalerträge oder andere zvE-relevante Einkünfte abseits von Zettel. Die ESt ist progressiv — ohne diesen Wert würde Zettel den Grenzsteuersatz auf deine Selbstständigkeit unterschätzen (Nebenberuf-Bug). Die Rücklage rechnet als <em>Aufschlag</em>: ESt(Gesamt-zvE) minus ESt(nur hier eingetragene Einkünfte) — den Lohnsteuer-Anteil führt dein AG ja bereits ab.
              </p>
            </div>

            {#if s.isKleinunternehmer}
              <label class="col-span-2 flex items-start gap-2.5 text-sm cursor-pointer select-none">
                <Checkbox bind:checked={s.taxReserveExpensesGross} />
                <span>
                  <span class="font-medium">Ausgaben in der Steuerrücklage brutto abziehen</span>
                  <span class="block text-xs text-muted-foreground mt-0.5">
                    Aus = netto (konservatives Minimum für dein Rücklagenkonto). An = brutto, steuerlich korrekt ohne Vorsteuerabzug.
                  </span>
                </span>
              </label>
            {:else}
              <div class="col-span-2 flex flex-col gap-1.5">
                <Label>Umsatzsteuer-Versteuerung</Label>
                <Select items={vatAccountingItems} bind:value={s.vatAccounting} />
                <p class="text-xs text-muted-foreground">
                  Ist-Versteuerung nur mit Genehmigung des Finanzamts (§ 20 UStG).
                </p>
              </div>
            {/if}

            <div class="col-span-2 mt-2">
              <PrepaymentsEditor />
            </div>

            <div class="col-span-2 border-t pt-4 mt-2">
              <PauschalReserveField
                bind:enabled={s.usePauschalTaxReserve}
                bind:percent={s.pauschalTaxPercent}
              />
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
              <IbanInput bind:value={s.bankIban} />
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
          <LogoField bind:path={s.logoPath} />
        </CardContent>
      </Card>

      <SettingsFormFooter saving={form.saving} error={form.error} />
    </form>
  {/if}
</SettingsShell>
