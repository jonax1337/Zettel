<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { loadSettings, saveSettings } from "$lib/db/queries";
  import type { Settings } from "$lib/db/schema";

  async function pickLogo() {
    if (!s) return;
    const picked = await open({
      multiple: false,
      filters: [{ name: "Bilder", extensions: ["png", "jpg", "jpeg", "svg"] }],
    });
    if (typeof picked === "string") s.logoPath = picked;
  }

  let s = $state<Settings | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    loadSettings()
      .then((row) => {
        s = row;
      })
      .catch((e) => {
        error = String(e);
      })
      .finally(() => {
        loading = false;
      });
  });

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!s) return;
    saving = true;
    saved = false;
    error = null;
    try {
      await saveSettings(s);
      saved = true;
      setTimeout(() => (saved = false), 2000);
    } catch (err) {
      error = String(err);
    } finally {
      saving = false;
    }
  }
</script>

<header class="mb-6">
  <h1 class="text-2xl font-semibold">Einstellungen</h1>
  <p class="text-sm text-neutral-500">Firmendaten, Steuer, Rechnungsnummer, Bank.</p>
</header>

{#if loading}
  <p class="text-sm text-neutral-500">Lade…</p>
{:else if error}
  <p class="text-sm text-red-600">Fehler: {error}</p>
{:else if s}
  <form onsubmit={onSubmit} class="max-w-2xl space-y-8">
    <section>
      <h2 class="text-sm font-semibold uppercase text-neutral-500 mb-3">Firma</h2>
      <div class="grid grid-cols-2 gap-3">
        <label class="col-span-2 flex flex-col gap-1 text-sm">
          Firmenname
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.companyName} required />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Inhaber:in
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.ownerName} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          E-Mail
          <input type="email" class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.email} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Telefon
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.phone} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Website
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.website} />
        </label>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold uppercase text-neutral-500 mb-3">Adresse</h2>
      <div class="grid grid-cols-3 gap-3">
        <label class="col-span-3 flex flex-col gap-1 text-sm">
          Straße & Nr.
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.street} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          PLZ
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.postalCode} />
        </label>
        <label class="col-span-2 flex flex-col gap-1 text-sm">
          Ort
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.city} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Land
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.country} />
        </label>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold uppercase text-neutral-500 mb-3">Steuer</h2>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1 text-sm">
          Steuernummer
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.taxNumber} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          USt-IdNr. (optional)
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.vatId} />
        </label>
        <label class="col-span-2 flex items-center gap-2 text-sm mt-2">
          <input type="checkbox" bind:checked={s.isKleinunternehmer} />
          Kleinunternehmer:in nach §19 UStG (keine USt-Ausweisung)
        </label>
        {#if s.isKleinunternehmer}
          <label class="col-span-2 flex flex-col gap-1 text-sm">
            §19-Hinweistext
            <textarea
              class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent"
              rows="2"
              bind:value={s.kleinunternehmerNote}
            ></textarea>
          </label>
        {/if}
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold uppercase text-neutral-500 mb-3">Bank</h2>
      <div class="grid grid-cols-2 gap-3">
        <label class="col-span-2 flex flex-col gap-1 text-sm">
          Bank
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.bankName} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          IBAN
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.bankIban} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          BIC
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.bankBic} />
        </label>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold uppercase text-neutral-500 mb-3">Rechnungen</h2>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1 text-sm">
          Nummern-Format
          <input class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.invoiceNumberFormat} />
          <span class="text-xs text-neutral-500">Platzhalter: {"{YYYY}"}, {"{NNNN}"}</span>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Aktueller Zähler
          <input type="number" min="0" class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.invoiceNumberCounter} />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Standard-Zahlungsfrist (Tage)
          <input type="number" min="0" class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent" bind:value={s.defaultPaymentTermsDays} />
        </label>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold uppercase text-neutral-500 mb-3">Logo & E-Rechnung</h2>
      <div class="grid grid-cols-2 gap-3">
        <label class="col-span-2 flex flex-col gap-1 text-sm">
          Logo (PNG, JPG oder SVG — erscheint im Rechnungs-Header)
          <div class="flex items-center gap-2">
            <input
              class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent flex-1"
              bind:value={s.logoPath}
              placeholder="Kein Logo ausgewählt"
            />
            <button
              type="button"
              onclick={pickLogo}
              class="px-3 py-1.5 border rounded text-sm border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Datei wählen…
            </button>
            {#if s.logoPath}
              <button
                type="button"
                onclick={() => s && (s.logoPath = null)}
                class="px-3 py-1.5 border rounded text-sm border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Entfernen
              </button>
            {/if}
          </div>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          ZUGFeRD-Profil
          <select
            class="border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent"
            bind:value={s.zugferdProfile}
          >
            <option value="en16931">EN 16931 / Comfort (Standard)</option>
            <option value="basic" disabled>BASIC — folgt in v0.2</option>
            <option value="extended" disabled>EXTENDED — folgt in v0.2</option>
          </select>
          <span class="text-xs text-neutral-500">EN 16931 deckt alle B2B-Standardfälle ab und ist als E-Rechnung universell akzeptiert.</span>
        </label>
      </div>
    </section>

    <div class="flex items-center gap-3">
      <button
        type="submit"
        disabled={saving}
        class="px-4 py-2 rounded bg-neutral-900 text-white text-sm hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {saving ? "Speichere…" : "Speichern"}
      </button>
      {#if saved}
        <span class="text-sm text-green-600">Gespeichert.</span>
      {/if}
      {#if error}
        <span class="text-sm text-red-600">{error}</span>
      {/if}
    </div>
  </form>
{/if}
