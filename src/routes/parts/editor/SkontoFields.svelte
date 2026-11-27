<script lang="ts">
  import type { Snippet } from "svelte";
  import { CheckField, Field, FieldGrid, Input } from "$lib/ui";
  import type { SkontoForm } from "$lib/utils/skonto-form";

  type Props = {
    skonto: SkontoForm;
    disabled?: boolean;
    /** Explanation shown below the inputs. */
    hint: Snippet;
  };
  let { skonto = $bindable(), disabled = false, hint }: Props = $props();
</script>

<div class="grid gap-3">
  <CheckField bind:checked={skonto.enabled} label="Skonto bei früher Zahlung anbieten" {disabled} />
  {#if skonto.enabled}
    <FieldGrid>
      <Field label="Prozent">
        <Input type="number" min="0.1" max="20" step="0.1" bind:value={skonto.percent} {disabled} />
      </Field>
      <Field label="Innerhalb (Tage)">
        <Input type="number" min="1" max="60" step="1" bind:value={skonto.days} {disabled} />
      </Field>
      <p class="col-span-2 text-xs text-muted-foreground">{@render hint()}</p>
    </FieldGrid>
  {/if}
</div>
