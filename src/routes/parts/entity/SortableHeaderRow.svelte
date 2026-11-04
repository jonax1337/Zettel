<script lang="ts" module>
  export type SortColumn<K extends string> = {
    key: K;
    label: string;
    /** Per-column classes on top of the shared `cellClass`. */
    class?: string;
    align?: "left" | "right";
  };
</script>

<script lang="ts" generics="K extends string">
  import { Checkbox, SortableTh } from "$lib/ui";
  import { cn } from "$lib/utils";
  import type { SortState } from "$lib/utils/sort";

  type Props = {
    sort: { state: SortState<K>; change: (key: K, dir: SortState<K>["dir"]) => void };
    columns: SortColumn<K>[];
    /** Padding shared by every header cell. */
    cellClass?: string;
    /** Adds a leading select-all checkbox column. */
    selection?: { allSelected: boolean; toggleAll: () => void };
    /** Adds a trailing, unlabeled column for the row action menu. */
    actionsColumn?: boolean;
  };

  let { sort, columns, cellClass = "px-4 py-3", selection, actionsColumn = false }: Props = $props();
</script>

<thead class="bg-muted/40 text-left">
  <tr>
    {#if selection}
      <th class={cn(cellClass, "w-10")}>
        <Checkbox
          checked={selection.allSelected}
          onCheckedChange={selection.toggleAll}
          aria-label="Alle auswählen"
        />
      </th>
    {/if}
    {#each columns as column (column.key)}
      <SortableTh
        column={column.key}
        activeKey={sort.state.key}
        activeDir={sort.state.dir}
        onChange={sort.change}
        align={column.align}
        class={cn(cellClass, column.class)}
      >
        {column.label}
      </SortableTh>
    {/each}
    {#if actionsColumn}
      <th class={cn(cellClass, "font-medium w-12")}></th>
    {/if}
  </tr>
</thead>
