<script lang="ts">
  import SettingsFormPage from "./SettingsFormPage.svelte";
  import NumberSequenceFields from "./NumberSequenceFields.svelte";
  import { NUMBER_SEQUENCES, numberingBlockReason, numberingProblems } from "./numbering-form";
  import { Input, FormSection, FieldGrid, Field, CheckField } from "$lib/ui";
</script>

<SettingsFormPage
  page="/settings/documents"
  description="Nummernkreise und Vorgaben für neue Belege."
  validate={numberingBlockReason}
>
  {#snippet children(s)}
    <FormSection level={3}
      title="Nummernkreise"
      description="Platzhalter im Format: {'{YYYY}'} Jahr, {'{YY}'} Jahr zweistellig, {'{MM}'} Monat und {'{N}'} bis {'{NNNN}'} für die laufende Nummer mit einer bis vier Stellen ({'{NNNN}'} ergibt 0001). Ohne diesen Platzhalter wäre jede Nummer gleich."
    >
      {@const problems = numberingProblems(s)}
      <FieldGrid>
        {#each NUMBER_SEQUENCES as sequence (sequence.key)}
          <NumberSequenceFields
            title={sequence.title}
            bind:format={s[sequence.formatKey]}
            bind:counter={s[sequence.counterKey]}
            problems={problems[sequence.key]}
          />
        {/each}
      </FieldGrid>
    </FormSection>

    <FormSection level={3}
      title="Vorgaben für neue Belege"
      description="Werden bei neuen Rechnungen und Angeboten vorbelegt und lassen sich pro Beleg ändern."
    >
      <FieldGrid>
        <Field label="Standard-Zahlungsfrist (Tage)">
          <Input type="number" min="0" bind:value={s.defaultPaymentTermsDays} />
        </Field>
        <Field label="Standard-Gültigkeit von Angeboten (Tage)">
          <Input type="number" min="1" bind:value={s.defaultOfferValidityDays} />
        </Field>
        <CheckField
          bind:checked={s.defaultSkontoActive}
          label="Standardmäßig Skonto anbieten"
          hint="Pro Beleg überschreibbar oder abschaltbar."
          wide
        />
        {#if s.defaultSkontoActive}
          <Field label="Skonto in Prozent">
            <Input type="number" min="0.1" max="20" step="0.1" bind:value={s.defaultSkontoPercent} />
          </Field>
          <Field label="Skonto innerhalb von (Tage)">
            <Input type="number" min="1" max="60" step="1" bind:value={s.defaultSkontoDays} />
          </Field>
          <p class="col-span-2 text-[12.5px] text-muted-foreground">
            Wird strukturiert im ZUGFeRD-XML (BT-20) und als Textzeile auf der PDF ausgewiesen.
            Branchenüblich: 2 % in 7 Tagen.
          </p>
        {/if}
      </FieldGrid>
    </FormSection>
  {/snippet}
</SettingsFormPage>
