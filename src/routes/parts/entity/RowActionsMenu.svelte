<script lang="ts">
  import type { Snippet } from "svelte";
  import { DropdownMenu, DropdownItem, DropdownSeparator } from "$lib/ui";
  import { MoreHorizontal, Pencil, Trash2 } from "$lib/brand-icons";

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
    <button
      type="button"
      class="inline-flex items-center justify-center size-8 rounded-md hover:bg-muted transition-colors"
      aria-label="Aktionen"
    >
      <MoreHorizontal class="size-4" />
    </button>
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
