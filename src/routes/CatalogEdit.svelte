<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    createCatalogItem,
    getCatalogItem,
    updateCatalogItem,
    type CatalogInput,
  } from "$lib/db/catalog";
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
    Checkbox,
    toast,
  } from "$lib/ui";
  import { ArrowLeft } from "@lucide/svelte";
  import { eurStringToCents } from "$lib/utils/money";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  const empty: CatalogInput = {
    name: "",
    descriptionDe: "",
    descriptionEn: null,
    unit: "Stk",
    defaultUnitPrice: 0,
    defaultVatRate: 19,
    defaultDatevAccount: null,
    tags: null,
    archived: false,
  };

  let form = $state<CatalogInput>({ ...empty });
  let priceText = $state("0,00");
  let id = $state<number | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);
  let saving = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (mode === "edit" && params?.id) {
      const numId = Number.parseInt(params.id, 10);
      if (!Number.isNaN(numId)) {
        id = numId;
        getCatalogItem(numId)
          .then((it) => {
            if (it) {
              form = {
                name: it.name,
                descriptionDe: it.descriptionDe,
                descriptionEn: it.descriptionEn,
                unit: it.unit,
                defaultUnitPrice: it.defaultUnitPrice,
                defaultVatRate: it.defaultVatRate,
                defaultDatevAccount: it.defaultDatevAccount,
                tags: it.tags,
                archived: it.archived,
              };
              priceText = (it.defaultUnitPrice / 100).toFixed(2).replace(".", ",");
            } else {
              error = "Eintrag nicht gefunden.";
            }
          })
          .catch((e) => (error = String(e)))
          .finally(() => (loaded = true));
      }
    } else {
      loaded = true;
    }
  });

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    form.defaultUnitPrice = eurStringToCents(priceText);
    saving = true;
    error = null;
    try {
      if (mode === "new") {
        await createCatalogItem(form);
        toast.success("Eintrag angelegt");
      } else if (id !== null) {
        await updateCatalogItem(id, form);
        toast.success("Änderungen gespeichert");
      }
      push("/catalog");
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }
</script>

<header class="mb-6">
  <a
    href="/catalog"
    use:link
    class="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" /> Katalog
  </a>
  <h1 class="text-3xl font-semibold tracking-tight mt-2">
    {mode === "new" ? "Neuer Katalog-Eintrag" : "Eintrag bearbeiten"}
  </h1>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  <form onsubmit={onSubmit}>
    <Card>
      <CardContent class="space-y-6">
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
            <Input type="number" min="0" max="30" step="1" bind:value={form.defaultVatRate} />
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
      </CardContent>
    </Card>

    <div class="flex items-center gap-3 mt-6">
      <Button type="submit" disabled={saving}>
        {saving ? "Speichere…" : mode === "new" ? "Anlegen" : "Speichern"}
      </Button>
      <Button type="button" onclick={() => push("/catalog")} variant="ghost">Abbrechen</Button>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}
