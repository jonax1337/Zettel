<script lang="ts">
  import {
    createCatalogItem,
    getCatalogItem,
    updateCatalogItem,
    type CatalogInput,
  } from "$lib/db/catalog";
  import { tick } from "svelte";
  import { push } from "svelte-spa-router";
  import {
    Button,
    CheckField,
    Field,
    FieldGrid,
    FormSection,
    Input,
    PageHeader,
    SaveBar,
    Textarea,
    focusFirstInvalid,
  } from "$lib/ui";
  import { eurStringToCents } from "$lib/utils/money";
  import { DEFAULT_UNIT } from "$lib/utils/units";
  import { createEntityForm } from "./parts/entity/entity-form.svelte";
  import { MAX_VAT_RATE_PERCENT, validateCatalogItem } from "./parts/entity/entity-validation";
  import { centsToPriceText } from "./parts/entity/format";
  import { STANDARD_VAT_RATE } from "$lib/utils/vat";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  const LIST_ROUTE = "/catalog";

  const empty: CatalogInput = {
    name: "",
    descriptionDe: "",
    descriptionEn: null,
    unit: DEFAULT_UNIT,
    defaultUnitPrice: 0,
    defaultVatRate: STANDARD_VAT_RATE,
    defaultDatevAccount: null,
    tags: null,
    archived: false,
  };

  let form = $state<CatalogInput>({ ...empty });
  let priceText = $state(centsToPriceText(0));

  const entity = createEntityForm({
    mode: () => mode,
    fetchById: getCatalogItem,
    notFoundMessage: "Eintrag nicht gefunden.",
    onLoaded: (item) => {
      form = {
        name: item.name,
        descriptionDe: item.descriptionDe,
        descriptionEn: item.descriptionEn,
        unit: item.unit,
        defaultUnitPrice: item.defaultUnitPrice,
        defaultVatRate: item.defaultVatRate,
        defaultDatevAccount: item.defaultDatevAccount,
        tags: item.tags,
        archived: item.archived,
      };
      priceText = centsToPriceText(item.defaultUnitPrice);
    },
    create: () => createCatalogItem(form),
    update: (id) => updateCatalogItem(id, form),
    createdMessage: "Eintrag angelegt",
    listRoute: LIST_ROUTE,
    unsavedState: () => [form, priceText],
  });

  $effect(() => {
    if (mode === "edit") entity.loadTarget(params?.id);
  });

  let formEl = $state<HTMLFormElement | null>(null);
  let attempted = $state(false);
  const errors = $derived(attempted ? validateCatalogItem(form) : {});

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    attempted = true;
    if (Object.keys(validateCatalogItem(form)).length > 0) {
      await tick();
      if (formEl) focusFirstInvalid(formEl);
      return;
    }
    form.defaultUnitPrice = eurStringToCents(priceText);
    await entity.save();
  }
</script>

<PageHeader
  title={mode === "new" ? "Neuer Katalog-Eintrag" : "Eintrag bearbeiten"}
  back={{ href: LIST_ROUTE, label: "Katalog" }}
/>

{#if entity.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  <form bind:this={formEl} onsubmit={handleSubmit} novalidate>
    <div class="max-w-2xl">
      <FormSection title="Eintrag">
        <FieldGrid>
          <Field label="Name" required wide error={errors.name}>
            <Input bind:value={form.name} placeholder="z. B. Stunde Beratung" />
          </Field>
          <Field label="Beschreibung (deutsch)" wide>
            <Textarea rows={2} bind:value={form.descriptionDe} placeholder="Vorbelegung für das Beschreibungsfeld der Position." />
          </Field>
          <Field label="Beschreibung (englisch)" wide>
            <Textarea
              rows={2}
              value={form.descriptionEn ?? ""}
              oninput={(e) => (form.descriptionEn = (e.currentTarget as HTMLTextAreaElement).value || null)}
              placeholder="Optional, wird bei Rechnungen mit englischer PDF-Sprache eingefügt."
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="Preis und Steuer">
        <FieldGrid class="grid-cols-3">
          <Field label="Standardpreis netto" hint="€ pro Einheit, ohne USt.">
            <Input type="text" inputmode="decimal" bind:value={priceText} />
          </Field>
          <Field label="USt-Satz (%)" required error={errors.defaultVatRate}>
            <Input type="number" min="0" max={MAX_VAT_RATE_PERCENT} step="1" bind:value={form.defaultVatRate} />
          </Field>
          <Field label="Einheit">
            <Input bind:value={form.unit} placeholder="Stk, h, Tag, km…" />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="Verwaltung">
        <FieldGrid>
          <Field label="Tags" hint="Mit Komma getrennt, für Filter und Suche.">
            <Input
              value={form.tags ?? ""}
              oninput={(e) => (form.tags = (e.currentTarget as HTMLInputElement).value || null)}
              placeholder="z. B. beratung, fahrtkosten"
            />
          </Field>
          <Field label="DATEV-Konto (für Aufwand)" hint="Nur relevant, wenn du diesen Eintrag in Ausgaben verwendest.">
            <Input
              value={form.defaultDatevAccount ?? ""}
              oninput={(e) => (form.defaultDatevAccount = (e.currentTarget as HTMLInputElement).value || null)}
              placeholder="z. B. 4980"
            />
          </Field>
          <CheckField bind:checked={form.archived} wide label="Archivieren" hint="Archivierte Einträge erscheinen nicht mehr im Picker." />
        </FieldGrid>
      </FormSection>
    </div>

    <SaveBar>
      <Button type="submit" disabled={entity.saving}>{entity.saving ? "Speichere…" : "Speichern"}</Button>
      <Button type="button" variant="outline" onclick={() => push(LIST_ROUTE)}>Abbrechen</Button>
      {#if entity.error}
        <span class="min-w-0 text-sm text-destructive" role="alert">{entity.error}</span>
      {/if}
    </SaveBar>
  </form>
{/if}
