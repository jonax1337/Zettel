<script lang="ts">
  import SettingsFormPage from "./SettingsFormPage.svelte";
  import FormSection from "./FormSection.svelte";
  import FieldGrid from "./FieldGrid.svelte";
  import Field from "./Field.svelte";
  import CheckField from "./CheckField.svelte";
  import PrepaymentsEditor from "./PrepaymentsEditor.svelte";
  import PauschalReserveField from "./PauschalReserveField.svelte";
  import ExpenseCategoryEuerList from "./ExpenseCategoryEuerList.svelte";
  import type { Settings } from "$lib/db/schema";
  import { Input, Select, Textarea } from "$lib/ui";
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
</script>

<SettingsFormPage
  page="/settings/tax"
  description="Grundlage für Rechnungen, die UStVA und die Schätzung der Steuer-Rücklage."
>
  {#snippet children(s)}
    <FormSection>
      <FieldGrid>
        <Field label="Steuernummer" required={!s.vatId}>
          <Input bind:value={s.taxNumber} required={!s.vatId} />
        </Field>
        <Field label="USt-IdNr." required={!s.taxNumber}>
          <Input bind:value={s.vatId} required={!s.taxNumber} />
        </Field>
        <p class="col-span-2 text-[12.5px] text-muted-foreground">
          Für E-Rechnungen nach EN 16931 (BR-CO-26) brauchst du mindestens eine der beiden Angaben.
          Kleinunternehmer:innen geben die Steuernummer an. Die USt-IdNr. brauchst du für Reverse-Charge-Rechnungen.
        </p>
        <CheckField
          bind:checked={s.isKleinunternehmer}
          label="Ich bin Kleinunternehmer:in nach § 19 UStG und weise keine Umsatzsteuer aus"
          wide
        />
        {#if s.isKleinunternehmer}
          <Field label="Hinweistext nach § 19 UStG" wide>
            <Textarea rows={2} bind:value={s.kleinunternehmerNote} />
          </Field>
        {:else}
          <Field
            label="Besteuerung der Umsätze"
            wide
            hint="Ist-Versteuerung nur mit Genehmigung des Finanzamts (§ 20 UStG)."
          >
            <Select items={vatAccountingItems} bind:value={s.vatAccounting} />
          </Field>
        {/if}
      </FieldGrid>
    </FormSection>

    <FormSection
      title="Für die Steuer-Rücklage"
      description="Grundlage für die Schätzung der Steuer-Rücklage. Keine Steuerberatung, nur eine Vorhersage zur Liquiditätsplanung."
    >
      <FieldGrid>
        <Field label="Rechtsform">
          <Select items={legalFormItems} bind:value={s.legalForm} />
        </Field>
        {#if s.legalForm === "trade"}
          <Field label="Gewerbe-Hebesatz (%)" hint="Hebesatz deiner Gemeinde. Bundesdurchschnitt etwa 400 %.">
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
          </Field>
        {/if}
        <Field label="Kirchensteuer">
          <Select
            items={churchRateItems}
            value={String(s.churchTaxRate)}
            onValueChange={(v) => (s.churchTaxRate = Number.parseFloat(v))}
          />
        </Field>
        <Field label="Familienstand (Steuer)">
          <Select items={filingStatusItems} bind:value={s.taxFilingStatus} />
        </Field>
        <Field label="Weitere Jahreseinkünfte (zu versteuerndes Einkommen, € pro Jahr)" wide>
          {#snippet hint()}
            Brutto-Jahresgehalt aus Anstellung, Rente, Kapitalerträge oder andere Einkünfte abseits von Zettel.
            Die Einkommensteuer ist progressiv: Ohne diesen Wert würde Zettel den Grenzsteuersatz auf deine
            Selbstständigkeit unterschätzen. Die Rücklage rechnet als <em>Aufschlag</em>:
            ESt(Gesamt-zvE) minus ESt(nur hier eingetragene Einkünfte). Den Lohnsteuer-Anteil führt dein
            Arbeitgeber ja bereits ab.
          {/snippet}
          <Input
            type="text"
            inputmode="decimal"
            value={centsToEur(s.otherIncomeAnnualCent)}
            onblur={(e) => (s.otherIncomeAnnualCent = eurStringToCents(e.currentTarget.value))}
            class="max-w-xs"
          />
        </Field>
        {#if s.isKleinunternehmer}
          <CheckField
            bind:checked={s.taxReserveExpensesGross}
            label="Ausgaben in der Steuerrücklage brutto abziehen"
            hint="Aus: netto (konservatives Minimum für dein Rücklagenkonto). An: brutto, steuerlich korrekt ohne Vorsteuerabzug."
            wide
          />
        {/if}
      </FieldGrid>
    </FormSection>

    <FormSection
      title="Geleistete ESt-Vorauszahlungen"
      description="Beim Verlassen eines Feldes sofort gespeichert, nicht erst mit „Speichern“."
    >
      <PrepaymentsEditor />
    </FormSection>

    <FormSection title="Pauschale Rücklage">
      <PauschalReserveField bind:enabled={s.usePauschalTaxReserve} bind:percent={s.pauschalTaxPercent} />
    </FormSection>

    <FormSection
      title="Ausgabenkategorien für die Anlage EÜR"
      description="Bestimmt, in welcher Zeile der Anlage EÜR die Ausgaben einer Kategorie erscheinen. Ausgaben ohne Kategorie landen in „Übrige unbeschränkt abziehbare Betriebsausgaben“. Änderungen gelten sofort, nicht erst mit „Speichern“."
    >
      <ExpenseCategoryEuerList />
    </FormSection>
  {/snippet}
</SettingsFormPage>
