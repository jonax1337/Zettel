<script lang="ts">
  import { DropdownItem, DropdownMenu, DropdownSeparator, MoreActionsTrigger } from "$lib/ui";
  import type { MenuEntry } from "./menu-entry";

  let { entries }: { entries: MenuEntry[] } = $props();
</script>

<DropdownMenu>
  {#snippet trigger()}
    <MoreActionsTrigger />
  {/snippet}

  {#each entries as entry, index (entry.id)}
    {#if index > 0 && entries[index - 1].group !== entry.group}
      <DropdownSeparator />
    {/if}
    {@const Icon = entry.icon}
    <DropdownItem destructive={entry.destructive} disabled={entry.disabled} onSelect={entry.onSelect}>
      <Icon />
      <span class="flex flex-col">
        {entry.label}
        {#if entry.hint}
          <span class="text-xs text-muted-foreground">{entry.hint}</span>
        {/if}
      </span>
    </DropdownItem>
  {/each}
</DropdownMenu>
