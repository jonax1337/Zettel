<script lang="ts" generics="S extends string">
  import Badge from "./Badge.svelte";
  import type { StatusTable } from "./status-meta";

  type Props = {
    status: S;
    table: StatusTable<S>;
    class?: string;
  };

  let { status, table, class: klass }: Props = $props();
</script>

<Badge variant={table[status].variant} class={klass}>{table[status].label}</Badge>
