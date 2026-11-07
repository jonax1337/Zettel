<script lang="ts" generics="S extends string">
  import { Label, Select } from "$lib/ui";
  import SearchInput from "../parts/entity/SearchInput.svelte";
  import { customerFilterItems, yearFilterItems } from "./list-support";

  type Counterparty = { label: string; allLabel: string };

  type Props = {
    status: S;
    statusItems: { value: S; label: string }[];
    year: string;
    /** Id of the selected customer, or of the vendor when `counterparty` says so. */
    customerId: string;
    search: string;
    years: number[];
    customers: { id: number; name: string }[];
    counterparty?: Counterparty;
  };

  const CUSTOMER: Counterparty = { label: "Kunde", allLabel: "Alle Kunden" };

  let {
    status = $bindable(),
    statusItems,
    year = $bindable(),
    customerId = $bindable(),
    search = $bindable(),
    years,
    customers,
    counterparty = CUSTOMER,
  }: Props = $props();

  const yearItems = $derived(yearFilterItems(years));
  const counterpartyItems = $derived(customerFilterItems(customers, counterparty.allLabel));
</script>

<div class="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Status</Label>
    <Select bind:value={status} items={statusItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Jahr</Label>
    <Select bind:value={year} items={yearItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">{counterparty.label}</Label>
    <Select bind:value={customerId} items={counterpartyItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Suche</Label>
    <SearchInput bind:value={search} placeholder="Nummer oder {counterparty.label}…" />
  </div>
</div>
