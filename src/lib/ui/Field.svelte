<script lang="ts">
  import type { Snippet } from "svelte";
  import Label from "./Label.svelte";
  import { cn } from "$lib/utils";
  import { markControls } from "./field-a11y";
  import { nextControlId } from "./label-target";

  type Props = {
    label: string;
    required?: boolean;
    /** Spans both columns of a FieldGrid. */
    wide?: boolean;
    /** Shown below the control; a snippet when the text needs markup. */
    hint?: string | Snippet;
    /** Replaces the hint while the value is not acceptable. */
    error?: string | null;
    children: Snippet;
    class?: string;
  };
  let { label, required = false, wide = false, hint, error = null, children, class: klass }: Props = $props();

  const labelId = nextControlId("field-label");
  const messageId = nextControlId("field-message");
  let controls = $state<HTMLElement | null>(null);

  // The date picker re-renders its segments, so the marks are applied again after DOM changes.
  $effect(() => {
    const root = controls;
    if (!root) return;
    const state = { invalid: Boolean(error), required, messageId, hasMessage: Boolean(error || hint), labelId };
    const apply = () => markControls(root, state);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  });
</script>

<div class={cn("flex min-w-0 flex-col gap-1.5", wide && "col-span-2", klass)}>
  <Label id={labelId} class="font-bold">
    {label}
    {#if required}<span class="text-destructive" aria-hidden="true">*</span>{/if}
  </Label>
  <div
    bind:this={controls}
    class="[&_[role=combobox][aria-invalid=true]]:border-destructive [&_[role=group]:has([aria-invalid=true])]:border-destructive"
  >
    {@render children()}
  </div>
  {#if error}
    <p id={messageId} class="text-[12.5px] text-destructive" role="alert">{error}</p>
  {:else if typeof hint === "string"}
    <p id={messageId} class="text-[12.5px] text-muted-foreground">{hint}</p>
  {:else if hint}
    <p id={messageId} class="text-[12.5px] text-muted-foreground">{@render hint()}</p>
  {/if}
</div>
