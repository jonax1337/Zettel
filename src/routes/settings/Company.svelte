<script lang="ts">
  import { link } from "svelte-spa-router";
  import SettingsFormPage from "./SettingsFormPage.svelte";
  import LogoField from "./LogoField.svelte";
  import { Input, IbanInput, FormSection, FieldGrid, Field } from "$lib/ui";
  import { isBlank } from "$lib/utils/company-completeness";
</script>

<SettingsFormPage
  page="/settings/company"
  description="Diese Angaben stehen im Briefkopf jeder Rechnung."
>
  {#snippet children(s)}
    {#if isBlank(s.taxNumber) && isBlank(s.vatId)}
      <p class="mb-6 rounded-lg bg-status-warn-bg px-3.5 py-2.5 text-sm text-status-warn">
        Steuernummer oder USt-IdNr. fehlt noch. Du trägst sie unter
        <a href="/settings/tax" use:link class="font-semibold underline">Steuern</a> ein.
      </p>
    {/if}

    <FormSection level={3}>
      <FieldGrid>
        <Field label="Firmenname" required wide>
          <Input bind:value={s.companyName} required />
        </Field>
        <Field label="Inhaber:in">
          <Input bind:value={s.ownerName} />
        </Field>
        <Field label="E-Mail">
          <Input type="email" bind:value={s.email} />
        </Field>
        <Field label="Telefon">
          <Input bind:value={s.phone} />
        </Field>
        <Field label="Website">
          <Input bind:value={s.website} />
        </Field>
      </FieldGrid>
    </FormSection>

    <FormSection level={3} title="Anschrift">
      <FieldGrid>
        <Field label="Straße und Hausnummer" required wide>
          <Input bind:value={s.street} required />
        </Field>
        <Field label="PLZ" required>
          <Input bind:value={s.postalCode} required />
        </Field>
        <Field label="Ort" required>
          <Input bind:value={s.city} required />
        </Field>
        <Field label="Land" required>
          <Input bind:value={s.country} required maxlength={2} placeholder="DE" />
        </Field>
        <p class="col-span-2 text-[12.5px] text-muted-foreground">
          Pflichtfelder für E-Rechnungen nach EN 16931. Das Land als ISO-2-Code.
        </p>
      </FieldGrid>
    </FormSection>

    <FormSection level={3}
      title="Handelsregister"
      description="Pflichtangaben für GmbH und UG auf Rechnungen (§ 35a GmbHG). Bei Einzelunternehmen leer lassen."
    >
      <FieldGrid>
        <Field label="Registergericht">
          <Input bind:value={s.registerCourt} placeholder="Amtsgericht Berlin-Charlottenburg" />
        </Field>
        <Field label="Registernummer">
          <Input bind:value={s.registerNumber} placeholder="HRB 123456 B" />
        </Field>
        <Field label="Geschäftsführung" wide>
          <Input bind:value={s.managingDirectors} placeholder="Erika Mustermann" />
        </Field>
      </FieldGrid>
    </FormSection>

    <FormSection level={3} title="Bankverbindung">
      <FieldGrid>
        <Field label="Bank" wide>
          <Input bind:value={s.bankName} />
        </Field>
        <Field label="IBAN">
          <IbanInput bind:value={s.bankIban} />
        </Field>
        <Field label="BIC">
          <Input bind:value={s.bankBic} />
        </Field>
      </FieldGrid>
    </FormSection>

    <FormSection level={3} title="Logo" description="Erscheint im Kopf der Rechnung.">
      <LogoField bind:path={s.logoPath} />
    </FormSection>
  {/snippet}
</SettingsFormPage>
