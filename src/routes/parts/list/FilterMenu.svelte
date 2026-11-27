<script lang="ts">
  import { ChevronDown } from "$lib/brand-icons";
  import { DropdownCheckboxItem, DropdownMenu } from "$lib/ui";
  import { buttonVariants } from "$lib/ui/Button.svelte";

  type FilterOption = { key: string; label: string };
  type Props = {
    /** The list's filter values; the menu flips the booleans named in `options`. */
    values: Record<string, string | boolean>;
    options: FilterOption[];
  };
  let { values, options }: Props = $props();

  const activeCount = $derived(options.filter((o) => values[o.key] === true).length);
</script>

<DropdownMenu
  align="start"
  triggerLabel={activeCount > 0 ? `Filter, ${activeCount} aktiv` : "Filter"}
  triggerClass={buttonVariants({ variant: "outline" })}
>
  {#snippet trigger()}
    Filter
    {#if activeCount > 0}
      <span class="rounded-full bg-status-calm-bg px-1.75 text-xs leading-[18px] font-bold text-foreground">{activeCount}</span>
    {/if}
    <ChevronDown class="size-4 opacity-60" />
  {/snippet}
  {#each options as option (option.key)}
    <DropdownCheckboxItem
      checked={values[option.key] === true}
      onCheckedChange={(checked) => (values[option.key] = checked)}
    >
      {option.label}
    </DropdownCheckboxItem>
  {/each}
</DropdownMenu>
