<script lang="ts">
  import { ChevronDown, ChevronUp } from "$lib/brand-icons";
  import { Button } from "$lib/ui";
  import { pluralize } from "../entity/format";

  type Props = {
    /** Number of lines without amount, shown or not. */
    count: number;
    noun: { singular: string; plural: string };
    open?: boolean;
  };

  let { count, noun, open = $bindable(false) }: Props = $props();

  const label = $derived(`${count} ${pluralize(count, noun.singular, noun.plural)} ohne Betrag`);
</script>

{#if count > 0}
  <div class="pt-3">
    <Button variant="ghost" size="sm" aria-expanded={open} onclick={() => (open = !open)}>
      {#if open}
        <ChevronUp />
        {label} ausblenden
      {:else}
        <ChevronDown />
        {label} zeigen
      {/if}
    </Button>
  </div>
{/if}
