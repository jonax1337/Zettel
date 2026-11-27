<script lang="ts">
  import { DatePicker } from "$lib/ui";
  import { CalendarRange } from "$lib/brand-icons";
  import MetaRow from "./MetaRow.svelte";
  import { QUIET_FIELD } from "./quiet-field";

  type Props = {
    mode: "single" | "period";
    deliveryDateIso?: string;
    startIso: string;
    endIso: string;
    /** Documents without a single delivery date (offers): the period is an optional add-on. */
    optional?: boolean;
    disabled?: boolean;
    error?: string | null;
  };
  let {
    mode = $bindable(),
    deliveryDateIso = $bindable(""),
    startIso = $bindable(),
    endIso = $bindable(),
    optional = false,
    disabled = false,
    error = null,
  }: Props = $props();

  const toggleLabel = $derived.by(() => {
    if (optional) return mode === "period" ? "Leistungszeitraum entfernen" : "Leistungszeitraum angeben";
    return mode === "period" ? "Stattdessen einen Einzeltag angeben" : "Stattdessen einen Zeitraum angeben";
  });
</script>

{#if mode === "period"}
  <MetaRow label="Leistung von">
    <DatePicker bind:value={startIso} {disabled} class={QUIET_FIELD} />
  </MetaRow>
  <MetaRow label="Leistung bis" {error}>
    <DatePicker bind:value={endIso} {disabled} class={QUIET_FIELD} />
  </MetaRow>
  <p class="text-right text-xs text-muted-foreground">EN-16931 BG-14: Zeitraum für mehrwöchige Leistungen.</p>
{:else if !optional}
  <MetaRow label="Leistungsdatum">
    <DatePicker bind:value={deliveryDateIso} {disabled} class={QUIET_FIELD} />
  </MetaRow>
{/if}
<div class="flex justify-end">
  <button
    type="button"
    class="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    onclick={() => (mode = mode === "single" ? "period" : "single")}
    {disabled}
  >
    <CalendarRange class="size-3.5" />
    {toggleLabel}
  </button>
</div>
