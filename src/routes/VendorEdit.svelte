<script lang="ts">
  import { push } from "svelte-spa-router";
  import {
    createVendor,
    getVendor,
    updateVendor,
    type VendorInput,
  } from "$lib/db/queries";
  import type { Vendor } from "$lib/db/schema";
  import { Button, Input, Textarea, Label, Card, CardContent, toast } from "$lib/ui";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { fetchEditTarget } from "./parts/entity/edit-target";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  const empty: VendorInput = {
    name: "",
    contactPerson: null,
    street: "",
    postalCode: "",
    city: "",
    country: "DE",
    email: null,
    phone: null,
    vatId: null,
    bankName: null,
    bankIban: null,
    bankBic: null,
    defaultCategory: null,
    notes: null,
  };

  let form = $state<VendorInput>({ ...empty });
  let id = $state<number | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);
  let saving = $state(false);
  let error = $state<string | null>(null);

  function toForm(v: Vendor): VendorInput {
    return {
      name: v.name,
      contactPerson: v.contactPerson,
      street: v.street,
      postalCode: v.postalCode,
      city: v.city,
      country: v.country,
      email: v.email,
      phone: v.phone,
      vatId: v.vatId,
      bankName: v.bankName,
      bankIban: v.bankIban,
      bankBic: v.bankBic,
      defaultCategory: v.defaultCategory,
      notes: v.notes,
    };
  }

  $effect(() => {
    if (mode !== "edit") return;
    fetchEditTarget(params?.id, getVendor, "Lieferant nicht gefunden.")
      .then((target) => {
        if ("error" in target) {
          error = target.error;
          return;
        }
        id = target.id;
        form = toForm(target.value);
      })
      .catch((e) => (error = String(e)))
      .finally(() => (loaded = true));
  });

  async function persist() {
    if (mode === "new") {
      await createVendor(form);
      toast.success("Lieferant angelegt");
    } else if (id !== null) {
      await updateVendor(id, form);
      toast.success("Änderungen gespeichert");
    } else {
      throw new Error("Keine ID");
    }
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    error = null;
    try {
      await persist();
      push("/vendors");
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }
</script>

<header class="mb-6">
  <BackLink href="/vendors">Lieferanten</BackLink>
  <h1 class="text-3xl font-semibold tracking-tight mt-2">
    {mode === "new" ? "Neuer Lieferant" : "Lieferant bearbeiten"}
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
            <Label>Straße & Nr.</Label>
            <Input bind:value={form.street} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>PLZ</Label>
            <Input bind:value={form.postalCode} />
          </div>
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Ort</Label>
            <Input bind:value={form.city} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Land</Label>
            <Input bind:value={form.country} />
          </div>
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
        </section>

        <section class="grid grid-cols-2 gap-4">
          <div class="col-span-2 text-xs uppercase tracking-wider text-muted-foreground">
            Bankverbindung (für Überweisungen)
          </div>
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Bank</Label>
            <Input bind:value={form.bankName} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>IBAN</Label>
            <Input bind:value={form.bankIban} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>BIC</Label>
            <Input bind:value={form.bankBic} />
          </div>
        </section>

        <section class="grid grid-cols-1 gap-4">
          <div class="flex flex-col gap-1.5">
            <Label>Standard-Kategorie</Label>
            <Input
              bind:value={form.defaultCategory}
              placeholder="z. B. Hosting, Software, Bürobedarf"
            />
            <p class="text-xs text-muted-foreground">
              Wird bei neuen Eingangsrechnungen dieses Lieferanten vorausgefüllt.
            </p>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Notizen</Label>
            <Textarea rows={3} bind:value={form.notes} />
          </div>
        </section>
      </CardContent>
    </Card>

    <div class="flex items-center gap-3 mt-6">
      <Button type="submit" disabled={saving}>
        {saving ? "Speichere…" : mode === "new" ? "Anlegen" : "Speichern"}
      </Button>
      <Button type="button" onclick={() => push("/vendors")} variant="ghost">Abbrechen</Button>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}
