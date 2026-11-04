<script lang="ts">
  import type { Snippet } from "svelte";
  import { Label, Select } from "$lib/ui";

  type Props = {
    value: "de" | "en";
    disabled?: boolean;
    children?: Snippet;
  };
  let { value = $bindable(), disabled = false, children }: Props = $props();

  const LANGUAGE_ITEMS: { value: "de" | "en"; label: string }[] = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "Englisch" },
  ];
</script>

<div class="flex flex-col gap-1.5 max-w-xs">
  <Label>Sprache der PDF</Label>
  <Select bind:value items={LANGUAGE_ITEMS} {disabled} />
  {#if children}
    <p class="text-xs text-muted-foreground">{@render children()}</p>
  {/if}
</div>
