<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import type { Settings } from "$lib/db/schema";
  import type { SettingsPageHref } from "$lib/navigation";
  import SettingsShell from "./SettingsShell.svelte";
  import SettingsFormFooter from "./SettingsFormFooter.svelte";
  import { SettingsForm } from "./settings-form.svelte";

  const FORM_ID = "settings-form";

  type Props = {
    page: SettingsPageHref;
    description: string;
    hint?: string;
    /** Returns why the current values must not be saved yet, or null. */
    validate?: (settings: Settings) => string | null;
    children: Snippet<[Settings]>;
  };
  let {
    page,
    description,
    hint = "Gilt für neu erzeugte Belege. Bereits erzeugte PDFs bleiben unverändert.",
    validate,
    children,
  }: Props = $props();

  // Every page loads the whole record and saves it whole, so a page never overwrites what another one saved.
  const form = new SettingsForm((settings) => validate?.(settings) ?? null);
  onMount(() => form.load());
</script>

<SettingsShell {page} {description}>
  {#if form.loading}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else if form.error && !form.settings}
    <p class="text-sm text-destructive">Fehler: {form.error}</p>
  {:else if form.settings}
    <form id={FORM_ID} onsubmit={(e) => form.submit(e)}>
      {@render children(form.settings)}
    </form>
  {/if}

  {#snippet footer()}
    {#if form.settings}
      <SettingsFormFooter
        formId={FORM_ID}
        saving={form.saving}
        dirty={form.dirty}
        error={form.error}
        {hint}
      />
    {/if}
  {/snippet}
</SettingsShell>
