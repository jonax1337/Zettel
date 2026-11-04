<script lang="ts">
  import {
    createCatalogItem,
    getCatalogItem,
    updateCatalogItem,
    type CatalogInput,
  } from "$lib/db/catalog";
  import { Input, Textarea, Label, Checkbox } from "$lib/ui";
  import { eurStringToCents } from "$lib/utils/money";
  import { DEFAULT_UNIT } from "$lib/utils/units";
  import { createEntityForm } from "./parts/entity/entity-form.svelte";
  import EntityFormShell from "./parts/entity/EntityFormShell.svelte";
  import { centsToPriceText } from "./parts/entity/format";
  import { STANDARD_VAT_RATE } from "./parts/entity/vat";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  const LIST_ROUTE = "/catalog";
  const MAX_VAT_RATE_PERCENT = 30;

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
  });

  $effect(() => {
    if (mode === "edit") entity.loadTarget(params?.id);
  });

  function onSubmit() {
    form.defaultUnitPrice = eurStringToCents(priceText);
    return entity.save();
  }
</script>

<EntityFormShell
  backHref={LIST_ROUTE}
  backLabel="Katalog"
  title={mode === "new" ? "Neuer Katalog-Eintrag" : "Eintrag bearbeiten"}
  {mode}
  loading={entity.loading}
  saving={entity.saving}
  error={entity.error}
  {onSubmit}
>
  <section class="grid grid-cols-2 gap-4">
    <div class="col-span-2 flex flex-col gap-1.5">
      <Label>Name <span class="text-destructive">*</span></Label>
      <Input bind:value={form.name} required placeholder="z. B. Stunde Beratung" />
    </div>

    <div class="col-span-2 flex flex-col gap-1.5">
      <Label>Beschreibung (deutsch)</Label>
      <Textarea rows={2} bind:value={form.descriptionDe} placeholder="Vorbelegung für das Beschreibungsfeld der Position." />
    </div>

    <div class="col-span-2 flex flex-col gap-1.5">
      <Label>Beschreibung (englisch)</Label>
      <Textarea
        rows={2}
        value={form.descriptionEn ?? ""}
        oninput={(e) => (form.descriptionEn = (e.currentTarget as HTMLTextAreaElement).value || null)}
        placeholder="Optional — wird ab v0.16 für englische Rechnungen genutzt."
      />
    </div>
  </section>

  <section class="grid grid-cols-3 gap-4 border-t pt-6">
    <div class="flex flex-col gap-1.5">
      <Label>Standardpreis netto</Label>
      <Input type="text" inputmode="decimal" bind:value={priceText} />
      <p class="text-xs text-muted-foreground">€ pro Einheit, ohne USt.</p>
    </div>

    <div class="flex flex-col gap-1.5">
      <Label>USt-Satz (%)</Label>
      <Input type="number" min="0" max={MAX_VAT_RATE_PERCENT} step="1" bind:value={form.defaultVatRate} />
    </div>

    <div class="flex flex-col gap-1.5">
      <Label>Einheit</Label>
      <Input bind:value={form.unit} placeholder="Stk, h, Tag, km…" />
    </div>
  </section>

  <section class="grid grid-cols-2 gap-4 border-t pt-6">
    <div class="flex flex-col gap-1.5">
      <Label>Tags (optional)</Label>
      <Input
        value={form.tags ?? ""}
        oninput={(e) => (form.tags = (e.currentTarget as HTMLInputElement).value || null)}
        placeholder="z. B. beratung, fahrtkosten"
      />
      <p class="text-xs text-muted-foreground">Komma-separiert, für Filter/Suche.</p>
    </div>

    <div class="flex flex-col gap-1.5">
      <Label>DATEV-Konto (für Aufwand)</Label>
      <Input
        value={form.defaultDatevAccount ?? ""}
        oninput={(e) => (form.defaultDatevAccount = (e.currentTarget as HTMLInputElement).value || null)}
        placeholder="z. B. 4980"
      />
      <p class="text-xs text-muted-foreground">Nur relevant, wenn dieser Eintrag in Eingangsrechnungen verwendet wird.</p>
    </div>
  </section>

  <section class="border-t pt-6">
    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox bind:checked={form.archived} />
      <span>Archivieren — wird im Picker nicht mehr angezeigt</span>
    </label>
  </section>
</EntityFormShell>

