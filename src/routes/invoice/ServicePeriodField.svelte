<script lang="ts">
  import { DatePicker, Label } from "$lib/ui";
  import { CalendarRange } from "$lib/brand-icons";

  type Props = {
    mode: "single" | "period";
    deliveryDateIso?: string;
    startIso: string;
    endIso: string;
    /** Documents without a single delivery date (offers): the period is an optional add-on. */
    optional?: boolean;
    disabled?: boolean;
  };
  let {
    mode = $bindable(),
    deliveryDateIso = $bindable(""),
    startIso = $bindable(),
    endIso = $bindable(),
    optional = false,
    disabled = false,
  }: Props = $props();

  const label = $derived(
    optional ? "Leistungszeitraum (optional)" : mode === "period" ? "Leistungszeitraum" : "Liefer-/Leistungsdatum",
  );
  const toggleLabel = $derived.by(() => {
    if (optional) return mode === "period" ? "Entfernen" : "Hinzufügen";
    return mode === "period" ? "Auf Einzeltag wechseln" : "Auf Zeitraum wechseln";
  });
</script>

<div class="flex flex-col gap-1.5 col-span-2">
  <div class="flex items-center justify-between">
    <Label>{label}</Label>
    <button
      type="button"
      class="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
      onclick={() => (mode = mode === "single" ? "period" : "single")}
      {disabled}
    >
      <CalendarRange class="size-3.5" />
      {toggleLabel}
    </button>
  </div>
  {#if mode === "period"}
    <div class="grid grid-cols-2 gap-2">
      <DatePicker bind:value={startIso} {disabled} />
      <DatePicker bind:value={endIso} {disabled} />
    </div>
    <p class="text-xs text-muted-foreground">EN-16931 BG-14: Zeitraum für mehrwöchige Leistungen.</p>
  {:else if !optional}
    <DatePicker bind:value={deliveryDateIso} {disabled} />
  {/if}
</div>
