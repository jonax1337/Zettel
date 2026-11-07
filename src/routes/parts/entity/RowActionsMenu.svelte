<script lang="ts">
  import type { Snippet } from "svelte";
  import { DropdownMenu, DropdownItem, DropdownSeparator, MoreActionsTrigger } from "$lib/ui";
  import { Pencil, Trash2 } from "$lib/brand-icons";

  type Props = {
    onEdit: () => void;
    onDelete: () => void;
    /** Additional items between "Bearbeiten" and the destructive "Löschen". */
    extraItems?: Snippet;
  };
  let { onEdit, onDelete, extraItems }: Props = $props();
</script>

<DropdownMenu>
  {#snippet trigger()}
    <MoreActionsTrigger variant="ghost" label="Aktionen" />
  {/snippet}
  <DropdownItem onSelect={onEdit}>
    <Pencil />
    Bearbeiten
  </DropdownItem>
  {@render extraItems?.()}
  <DropdownSeparator />
  <DropdownItem destructive onSelect={onDelete}>
    <Trash2 />
    Löschen
  </DropdownItem>
</DropdownMenu>
