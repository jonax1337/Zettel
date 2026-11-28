<script lang="ts">
  import type { InvoiceStatus } from "$lib/db/schema";
  import { Badge, StatusBadge } from "$lib/ui";
  import { overdueDays, overdueLabel } from "./list-support";
  import { INVOICE_STATUS } from "./status";

  type Props = { status: InvoiceStatus; overdue: boolean; dueDate: number; now: number };
  let { status, overdue, dueDate, now }: Props = $props();
</script>

<!-- An overdue invoice says how late it is instead of repeating "Versendet"; a part payment stays visible. -->
{#if overdue}
  <Badge variant="late">{overdueLabel(overdueDays(dueDate, now))}</Badge>
  {#if status === "partial"}
    <span class="text-xs text-muted-foreground">teilbezahlt</span>
  {/if}
{:else}
  <StatusBadge {status} table={INVOICE_STATUS} />
{/if}
