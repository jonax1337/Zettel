<script lang="ts">
  import { Panel } from "$lib/ui";
  import type { Customer } from "$lib/db/schema";
  import { formatDate } from "$lib/utils/date";

  let { customer }: { customer: Pick<Customer, "notes" | "followUpDate"> } = $props();
</script>

<Panel title="Notiz und Wiedervorlage">
  {#if customer.notes}
    <p class="text-sm whitespace-pre-line [overflow-wrap:anywhere]">{customer.notes}</p>
  {/if}
  {#if customer.followUpDate}
    <p class="text-[13px] text-muted-foreground tabular-nums">Wiedervorlage am {formatDate(customer.followUpDate)}</p>
  {/if}
</Panel>
