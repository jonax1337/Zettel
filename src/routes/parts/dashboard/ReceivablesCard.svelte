<script lang="ts">
  import { Card, CardContent } from "$lib/ui";
  import { Hourglass } from "$lib/brand-icons";
  import type { OldestOverdue } from "$lib/dashboard/queries";
  import { centsToEur } from "$lib/utils/money";
  import { pluralize } from "../entity/format";

  type Props = {
    loading: boolean;
    receivables: OldestOverdue;
  };
  let { loading, receivables }: Props = $props();
</script>

<Card class="lg:col-span-2">
  <CardContent>
    <div class="flex items-center justify-between mb-3">
      <div class="text-xs text-muted-foreground uppercase tracking-wider">Offene Forderungen</div>
      <Hourglass class="size-4 text-muted-foreground" />
    </div>
    {#if loading}
      <div class="text-sm text-muted-foreground">Lade…</div>
    {:else if receivables.openCount === 0}
      <div class="text-sm text-muted-foreground">Keine offenen Forderungen.</div>
    {:else}
      <div class="space-y-1">
        <div class="text-2xl font-semibold tabular-nums">{centsToEur(receivables.openTotal)}</div>
        <div class="text-sm text-muted-foreground">
          {receivables.openCount} {pluralize(receivables.openCount, "Rechnung", "Rechnungen")} offen
          {#if receivables.daysOverdue !== null && receivables.daysOverdue > 0}
            · älteste {receivables.daysOverdue} {pluralize(receivables.daysOverdue, "Tag", "Tage")} überfällig
          {:else if receivables.daysOverdue !== null}
            · alle innerhalb Frist
          {/if}
        </div>
      </div>
    {/if}
  </CardContent>
</Card>
