<script lang="ts">
  import type { Snippet } from "svelte";
  import { Label } from "$lib/ui";
  import { markControls } from "./field-a11y";

  type Props = {
    label: string;
    required?: boolean;
    hint?: string;
    error?: string | null;
    children: Snippet;
    class?: string;
  };
  let { label, required = false, hint, error = null, children, class: klass = "" }: Props = $props();

  let controls = $state<HTMLElement | null>(null);

  // The date picker re-renders its segments, so the marks are applied again after DOM changes.
  $effect(() => {
    const root = controls;
    if (!root) return;
    const state = { invalid: Boolean(error), required };
    const apply = () => markControls(root, state);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  });
</script>

<div class="flex flex-col gap-1.5 {klass}">
  <Label>{label}{#if required}<span class="text-destructive" aria-hidden="true">*</span>{/if}</Label>
  <div
    bind:this={controls}
    class="[&_[role=combobox][aria-invalid=true]]:border-destructive [&_[role=group]:has([aria-invalid=true])]:border-destructive"
  >
    {@render children()}
  </div>
  {#if error}
    <p class="text-[13px] text-destructive" role="alert">{error}</p>
  {:else if hint}
    <p class="text-[13px] text-muted-foreground">{hint}</p>
  {/if}
</div>
