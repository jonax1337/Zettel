<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    description: Snippet;
    /** Extra controls between the text and the action, e.g. a selection. */
    details?: Snippet;
    /** The destructive action. */
    children: Snippet;
  };
  let { title, description, details, children }: Props = $props();
</script>

<div class="mb-3 rounded-xl border border-destructive/60 px-[18px] py-4">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
    <div class="min-w-0 flex-1 basis-64">
      <h3 class="text-sm">{title}</h3>
      <p class="mt-0.5 text-[13px] text-muted-foreground">
        {@render description()}
      </p>
    </div>
    <div class="flex-none">
      {@render children()}
    </div>
  </div>
  {#if details}
    <div class="mt-3.5">
      {@render details()}
    </div>
  {/if}
</div>
