<script lang="ts">
  import { guardUnsavedChanges } from "$lib/utils/unsaved-guard.svelte";
  import { push } from "svelte-spa-router";
  import {
    createCustomer,
    getCustomer,
    updateCustomer,
    type CustomerInput,
  } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";
  import { Button, Input, Textarea, Label, Card, CardContent, DatePicker, toast } from "$lib/ui";
  import { fromIsoDate, toIsoDate } from "$lib/utils/date";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { fetchEditTarget } from "./parts/entity/edit-target";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  const ISO_COUNTRY_CODE_LENGTH = 2;

  const empty: CustomerInput = {
    name: "",
    contactPerson: null,
    street: "",
    postalCode: "",
    city: "",
    country: "DE",
    email: null,
    phone: null,
    vatId: null,
    notes: null,
  };

  let form = $state<CustomerInput>({ ...empty });
  let followUpIso = $state<string>("");
  let id = $state<number | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);
  let saving = $state(false);
  let error = $state<string | null>(null);

  function toForm(c: Customer): CustomerInput {
    return {
      name: c.name,
      contactPerson: c.contactPerson,
      street: c.street,
      postalCode: c.postalCode,
      city: c.city,
      country: c.country,
      email: c.email,
      phone: c.phone,
      vatId: c.vatId,
      notes: c.notes,
    };
  }

  $effect(() => {
    if (mode !== "edit") return;
    fetchEditTarget(params?.id, getCustomer, "Kunde nicht gefunden.")
      .then((target) => {
        if ("error" in target) {
          error = target.error;
          return;
        }
        id = target.id;
        form = toForm(target.value);
        followUpIso = target.value.followUpDate ? toIsoDate(target.value.followUpDate) : "";
      })
      .catch((e) => (error = String(e)))
      .finally(() => (loaded = true));
  });

  async function persist() {
    if (mode === "new") {
      await createCustomer(form);
      toast.success("Kunde angelegt");
    } else if (id !== null) {
      await updateCustomer(id, form);
      toast.success("Änderungen gespeichert");
    } else {
      throw new Error("Keine ID");
    }
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const country = form.country?.trim().toUpperCase() ?? "";
    if (country.length !== ISO_COUNTRY_CODE_LENGTH) {
      error = "Land muss ein zweistelliger ISO-Code sein (z. B. DE, AT, CH).";
      toast.error("Land ungültig", error);
      return;
    }
    form.country = country;
    form.followUpDate = followUpIso ? fromIsoDate(followUpIso) : null;
    saving = true;
    error = null;
    try {
      await persist();
      unsaved.markClean();
      push("/customers");
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  const unsaved = guardUnsavedChanges(
    () => [form, followUpIso],
    () => !loading,
  );
</script>

<header class="mb-6">
  <BackLink href="/customers">Kunden</BackLink>
  <h1 class="text-3xl font-semibold tracking-tight mt-2">
    {mode === "new" ? "Neuer Kunde" : "Kunde bearbeiten"}
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
            <Label>Name / Firma <span class="text-destructive">*</span></Label>
            <Input bind:value={form.name} required />
          </div>
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Ansprechpartner:in</Label>
            <Input bind:value={form.contactPerson} />
          </div>
        </section>

        <section class="grid grid-cols-3 gap-4">
          <div class="col-span-3 flex flex-col gap-1.5">
            <Label>Straße & Nr. <span class="text-destructive">*</span></Label>
            <Input bind:value={form.street} required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>PLZ <span class="text-destructive">*</span></Label>
            <Input bind:value={form.postalCode} required />
          </div>
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Ort <span class="text-destructive">*</span></Label>
            <Input bind:value={form.city} required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Land <span class="text-destructive">*</span></Label>
            <Input bind:value={form.country} required maxlength={ISO_COUNTRY_CODE_LENGTH} placeholder="DE" />
          </div>
          <p class="col-span-3 text-xs text-muted-foreground -mt-2">
            Pflichtfelder für EN16931-konforme E-Rechnungen. Land als ISO-2-Code (DE, AT, FR…).
          </p>
        </section>

        <section class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <Label>E-Mail</Label>
            <Input type="email" bind:value={form.email} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Telefon</Label>
            <Input bind:value={form.phone} />
          </div>
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>USt-IdNr.</Label>
            <Input bind:value={form.vatId} />
          </div>
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Notizen (intern)</Label>
            <Textarea rows={3} bind:value={form.notes} />
            <p class="text-xs text-muted-foreground">Nur intern sichtbar, erscheint nicht auf Rechnungen.</p>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Wiedervorlage am</Label>
            <DatePicker bind:value={followUpIso} />
            <p class="text-xs text-muted-foreground">Optional — Erinnerung im Dashboard.</p>
          </div>
        </section>
      </CardContent>
    </Card>

    <div class="flex items-center gap-3 mt-6">
      <Button type="submit" disabled={saving}>
        {saving ? "Speichere…" : mode === "new" ? "Anlegen" : "Speichern"}
      </Button>
      <Button type="button" onclick={() => push("/customers")} variant="ghost">Abbrechen</Button>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}
