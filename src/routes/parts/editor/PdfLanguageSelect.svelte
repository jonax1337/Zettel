<script lang="ts">
  import type { Snippet } from "svelte";
  import { Field, Select } from "$lib/ui";

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

<Field label="Sprache der PDF" hint={children}>
  <Select bind:value items={LANGUAGE_ITEMS} {disabled} />
</Field>
