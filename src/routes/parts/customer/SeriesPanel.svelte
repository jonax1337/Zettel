<script lang="ts">
  import { Panel } from "$lib/ui";
  import { link } from "svelte-spa-router";
  import type { CustomerSeries } from "$lib/db/customer-overview";
  import { formatDate } from "$lib/utils/date";
  import { centsToEur } from "$lib/utils/money";
  import { RECURRING_INTERVAL_LABEL } from "../entity/recurring";

  let { series }: { series: CustomerSeries[] } = $props();
</script>

<Panel title="Serie">
  <ul class="grid grid-cols-1 gap-3 text-sm">
    {#each series as entry (entry.id)}
      <li>
        <a href={`/recurring/${entry.id}`} use:link class="font-semibold [overflow-wrap:anywhere] hover:underline focus-visible:underline">
          {entry.name}
        </a>
        <p class="text-muted-foreground">
          {RECURRING_INTERVAL_LABEL[entry.interval]}, {centsToEur(entry.netCent)} netto
        </p>
        <p class="text-[13px] text-muted-foreground tabular-nums">
          {entry.active ? `Nächste Rechnung am ${formatDate(entry.nextDueDate)}` : "Pausiert"}
        </p>
      </li>
    {/each}
  </ul>
</Panel>
