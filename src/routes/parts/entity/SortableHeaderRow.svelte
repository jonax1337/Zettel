<script lang="ts" module>
  export type SortColumn<K extends string> = {
    key: K;
    label: string;
    /** Extra classes for the column's header cell. */
    class?: string;
    align?: "left" | "right";
  };
</script>

<script lang="ts" generics="K extends string">
  import { Checkbox, SortableTh } from "$lib/ui";
  import type { SortState } from "$lib/utils/sort";

  type Props = {
    sort: { state: SortState<K>; change: (key: K, dir: SortState<K>["dir"]) => void };
    columns: SortColumn<K>[];
    /** Adds a leading select-all checkbox column. */
    selection?: { allSelected: boolean; toggleAll: () => void };
    /** Adds a trailing column for the row action menu, labeled for screen readers only. */
    actionsColumn?: boolean;
  };

  let { sort, columns, selection, actionsColumn = false }: Props = $props();
</script>

<thead>
  <tr>
    {#if selection}
      <th class="w-9">
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
        class={column.class}
      >
        {column.label}
      </SortableTh>
    {/each}
    {#if actionsColumn}
      <th class="w-12"><span class="sr-only">Aktionen</span></th>
    {/if}
  </tr>
</thead>
