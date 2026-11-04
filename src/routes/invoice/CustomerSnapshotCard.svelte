<script lang="ts">
  import { Card, CardContent } from "$lib/ui";
  import type { CustomerSnapshot } from "$lib/db/schema";

  let { customer }: { customer: CustomerSnapshot } = $props();
</script>

<Card>
  <CardContent>
    <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">
      Kunde (Snapshot)
    </h2>
    <div class="text-sm space-y-0.5">
      <div class="font-medium">{customer.name}</div>
      {#if customer.contactPerson}<div>{customer.contactPerson}</div>{/if}
      <div class="text-muted-foreground">{customer.street}</div>
      <div class="text-muted-foreground">{customer.postalCode} {customer.city}</div>
      <div class="text-muted-foreground">{customer.country}</div>
      {#if customer.vatId}
        <div class="text-xs mt-2 text-muted-foreground">USt-IdNr.: {customer.vatId}</div>
      {/if}
    </div>
  </CardContent>
</Card>
