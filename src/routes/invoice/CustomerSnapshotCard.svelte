<script lang="ts">
  import type { CustomerSnapshot } from "$lib/db/schema";

  let { customer }: { customer: CustomerSnapshot } = $props();
</script>

<address class="space-y-0.5 text-sm not-italic">
  <div class="font-bold">{customer.name}</div>
  {#if customer.contactPerson}<div>{customer.contactPerson}</div>{/if}
  <div class="text-muted-foreground">{customer.street}</div>
  <div class="text-muted-foreground">{customer.postalCode} {customer.city}</div>
  <div class="text-muted-foreground">{customer.country}</div>
  {#if customer.vatId}
    <div class="mt-2 text-xs text-muted-foreground">USt-IdNr.: {customer.vatId}</div>
  {/if}
</address>
