<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    createVendor,
    getVendor,
    updateVendor,
    type VendorInput,
  } from "$lib/db/queries";
  import { Button, Input, Textarea, Label, Card, CardContent, toast } from "$lib/ui";
  import { ArrowLeft } from "@lucide/svelte";

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

  $effect(() => {
    if (mode === "edit" && params?.id) {
      const numId = Number.parseInt(params.id, 10);
      if (!Number.isNaN(numId)) {
        id = numId;
        getVendor(numId)
          .then((v) => {
            if (v) {
              form = {
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
            } else {
              error = "Lieferant nicht gefunden.";
            }
          })
          .catch((e) => (error = String(e)))
          .finally(() => (loaded = true));
      }
    }
  });

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    error = null;
    try {
      if (mode === "new") {
        await createVendor(form);
        toast.success("Lieferant angelegt");
      } else if (id !== null) {
        await updateVendor(id, form);
        toast.success("Änderungen gespeichert");
      } else {
        throw new Error("Keine ID");
      }
      push("/vendors");
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  function onCancel() {
    push("/vendors");
  }
</script>

<header class="mb-6">
  <a
    href="/vendors"
    use:link
    class="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" /> Lieferanten
  </a>
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
      <Button type="button" onclick={onCancel} variant="ghost">Abbrechen</Button>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}
