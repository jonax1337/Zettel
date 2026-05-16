<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    createCustomer,
    getCustomer,
    updateCustomer,
    type CustomerInput,
  } from "$lib/db/queries";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

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
        getCustomer(numId)
          .then((c) => {
            if (c) {
              form = {
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
            } else {
              error = "Kunde nicht gefunden.";
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
        await createCustomer(form);
      } else if (id !== null) {
        await updateCustomer(id, form);
      }
      push("/customers");
    } catch (err) {
      error = String(err);
    } finally {
      saving = false;
    }
  }

  const inputClass =
    "border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent";
</script>

<header class="mb-6">
  <a href="/customers" use:link class="text-sm text-neutral-500 hover:underline">
    ← Kunden
  </a>
  <h1 class="text-2xl font-semibold mt-1">
    {mode === "new" ? "Neuer Kunde" : "Kunde bearbeiten"}
  </h1>
</header>

{#if loading}
  <p class="text-sm text-neutral-500">Lade…</p>
{:else}
  <form onsubmit={onSubmit} class="max-w-2xl space-y-6">
    <section class="grid grid-cols-2 gap-3">
      <label class="col-span-2 flex flex-col gap-1 text-sm">
        Name / Firma <span class="text-red-600">*</span>
        <input class={inputClass} bind:value={form.name} required />
      </label>
      <label class="col-span-2 flex flex-col gap-1 text-sm">
        Ansprechpartner:in
        <input class={inputClass} bind:value={form.contactPerson} />
      </label>
    </section>

    <section class="grid grid-cols-3 gap-3">
      <label class="col-span-3 flex flex-col gap-1 text-sm">
        Straße & Nr.
        <input class={inputClass} bind:value={form.street} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        PLZ
        <input class={inputClass} bind:value={form.postalCode} />
      </label>
      <label class="col-span-2 flex flex-col gap-1 text-sm">
        Ort
        <input class={inputClass} bind:value={form.city} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Land
        <input class={inputClass} bind:value={form.country} />
      </label>
    </section>

    <section class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1 text-sm">
        E-Mail
        <input type="email" class={inputClass} bind:value={form.email} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Telefon
        <input class={inputClass} bind:value={form.phone} />
      </label>
      <label class="col-span-2 flex flex-col gap-1 text-sm">
        USt-IdNr.
        <input class={inputClass} bind:value={form.vatId} />
      </label>
      <label class="col-span-2 flex flex-col gap-1 text-sm">
        Notizen
        <textarea rows="3" class={inputClass} bind:value={form.notes}></textarea>
      </label>
    </section>

    <div class="flex items-center gap-3">
      <button
        type="submit"
        disabled={saving}
        class="px-4 py-2 rounded bg-neutral-900 text-white text-sm hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {saving ? "Speichere…" : mode === "new" ? "Anlegen" : "Speichern"}
      </button>
      <a href="/customers" use:link class="text-sm text-neutral-500 hover:underline">
        Abbrechen
      </a>
      {#if error}
        <span class="text-sm text-red-600">{error}</span>
      {/if}
    </div>
  </form>
{/if}
