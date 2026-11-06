<script lang="ts">
  import type { Snippet } from "svelte";
  import { Checkbox, Input, Label } from "$lib/ui";
  import type { SkontoForm } from "$lib/utils/skonto-form";

  type Props = {
    skonto: SkontoForm;
    disabled?: boolean;
    /** Explanation shown below the inputs. */
    hint: Snippet;
  };
  let { skonto = $bindable(), disabled = false, hint }: Props = $props();
</script>

<div class="border-t pt-4">
  <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
    <Checkbox bind:checked={skonto.enabled} {disabled} />
    <span class="font-medium">Skonto bei Frühzahlung anbieten</span>
  </label>
  {#if skonto.enabled}
    <div class="mt-3 ml-7 grid grid-cols-2 gap-3 max-w-md">
      <div class="flex flex-col gap-1.5">
        <Label class="text-xs">Prozent</Label>
        <Input type="number" min="0.1" max="20" step="0.1" bind:value={skonto.percent} {disabled} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label class="text-xs">Innerhalb (Tage)</Label>
        <Input type="number" min="1" max="60" step="1" bind:value={skonto.days} {disabled} />
      </div>
      <p class="col-span-2 text-xs text-muted-foreground">
        {@render hint()}
      </p>
    </div>
  {/if}
</div>
