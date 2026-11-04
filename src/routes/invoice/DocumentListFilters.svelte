<script lang="ts" generics="S extends string">
  import { Label, Select } from "$lib/ui";
  import type { Customer } from "$lib/db/schema";
  import SearchInput from "../parts/entity/SearchInput.svelte";
  import { customerFilterItems, yearFilterItems } from "./list-support";

  type Props = {
    status: S;
    statusItems: { value: S; label: string }[];
    year: string;
    customerId: string;
    search: string;
    years: number[];
    customers: Customer[];
  };

  let {
    status = $bindable(),
    statusItems,
    year = $bindable(),
    customerId = $bindable(),
    search = $bindable(),
    years,
    customers,
  }: Props = $props();

  const yearItems = $derived(yearFilterItems(years));
  const customerItems = $derived(customerFilterItems(customers));
</script>

<div class="grid grid-cols-1 md:grid-cols-4 gap-3">
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Status</Label>
    <Select bind:value={status} items={statusItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Jahr</Label>
    <Select bind:value={year} items={yearItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Kunde</Label>
    <Select bind:value={customerId} items={customerItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Suche</Label>
    <SearchInput bind:value={search} placeholder="Nummer oder Kunde…" />
  </div>
</div>
