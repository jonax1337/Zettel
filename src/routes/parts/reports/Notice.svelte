<script lang="ts">
  import type { Snippet } from "svelte";
  import { AlertTriangle, Info } from "$lib/brand-icons";

  type Props = {
    /** "info" explains in muted text; "warn" is something the user has to act on or keep in mind. */
    tone?: "info" | "warn";
    children: Snippet;
  };

  let { tone = "info", children }: Props = $props();
</script>

{#if tone === "warn"}
  <div role="note" class="mb-4 flex max-w-[78ch] items-start gap-2.5 text-sm font-medium text-status-warn">
    <AlertTriangle class="mt-0.5 size-4 shrink-0" />
    <div>{@render children()}</div>
  </div>
{:else}
  <div class="mb-4 flex max-w-[78ch] items-start gap-2.5 text-[13px] text-muted-foreground">
    <Info class="mt-0.5 size-4 shrink-0" />
    <div>{@render children()}</div>
  </div>
{/if}
