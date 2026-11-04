<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { isValidIban, normalizeIban } from "$lib/utils/iban";
  import { cn } from "$lib/utils";
  import Input from "./Input.svelte";

  type Props = Omit<HTMLInputAttributes, "value"> & {
    value?: string | null;
  };

  let { value = $bindable(), class: klass, onfocus, onblur, ...rest }: Props = $props();

  let focused = $state(false);
  // Only flag once the user leaves the field, not while still typing.
  const invalid = $derived(!focused && !!value && !isValidIban(value));
  // The stored value never contains spaces; the gaps below are display only.
  const groups = $derived(normalizeIban(value ?? "").match(/.{1,4}/g) ?? []);
  const showGroups = $derived(!focused && groups.length > 0);
</script>

<div class="relative">
  <Input
    bind:value
    {...rest}
    class={cn("font-mono", showGroups && "text-transparent", klass)}
    aria-invalid={invalid}
    autocomplete="off"
    spellcheck={false}
    onfocus={(e) => {
      focused = true;
      onfocus?.(e);
    }}
    onblur={(e) => {
      focused = false;
      value = normalizeIban(value ?? "");
      onblur?.(e);
    }}
  />
  {#if showGroups}
    <div
      class="pointer-events-none absolute inset-y-0 left-[calc(0.75rem+1px)] flex items-center gap-[1.1ch] font-mono text-sm"
      aria-hidden="true"
    >
      {#each groups as group}<span>{group}</span>{/each}
    </div>
  {/if}
</div>
{#if invalid}
  <p class="text-destructive text-xs">IBAN-Prüfsumme ungültig.</p>
{/if}
