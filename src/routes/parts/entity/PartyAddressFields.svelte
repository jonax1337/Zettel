<script lang="ts" generics="T extends PartyFields">
  import { Field, FieldGrid, FormSection, Input } from "$lib/ui";
  import { ISO_COUNTRY_CODE_LENGTH } from "./country";
  import type { PartyErrors } from "./entity-validation";
  import type { PartyFields } from "./party-form";

  type Props = {
    form: T;
    errors: PartyErrors;
    /** Customers need a full address for EN16931 e-invoices; vendors may leave it empty. */
    requireAddress?: boolean;
  };
  let { form = $bindable(), errors, requireAddress = false }: Props = $props();
</script>

<FormSection title="Stammdaten">
  <FieldGrid>
    <Field label="Name / Firma" required wide error={errors.name}>
      <Input bind:value={form.name} />
    </Field>
    <Field label="Ansprechpartner:in" wide>
      <Input bind:value={form.contactPerson} />
    </Field>
  </FieldGrid>
</FormSection>

<FormSection
  title="Anschrift"
  description={requireAddress ? "Pflichtangaben für EN16931-konforme E-Rechnungen." : undefined}
>
  <FieldGrid>
    <Field label="Straße und Hausnummer" required={requireAddress} wide error={errors.street}>
      <Input bind:value={form.street} />
    </Field>
    <Field label="PLZ" required={requireAddress} error={errors.postalCode}>
      <Input bind:value={form.postalCode} />
    </Field>
    <Field label="Ort" required={requireAddress} error={errors.city}>
      <Input bind:value={form.city} />
    </Field>
    <Field label="Land" required error={errors.country} hint="Als ISO-2-Code (DE, AT, FR …).">
      <Input bind:value={form.country} maxlength={ISO_COUNTRY_CODE_LENGTH} placeholder="DE" />
    </Field>
  </FieldGrid>
</FormSection>

<FormSection title="Kontakt">
  <FieldGrid>
    <Field label="E-Mail" error={errors.email}>
      <Input type="email" bind:value={form.email} />
    </Field>
    <Field label="Telefon">
      <Input bind:value={form.phone} />
    </Field>
  </FieldGrid>
</FormSection>
