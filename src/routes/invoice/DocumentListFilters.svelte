<script lang="ts" generics="S extends string">
  import type { Snippet } from "svelte";
  import { Segmented, Select } from "$lib/ui";
  import ListToolbar from "../parts/list/ListToolbar.svelte";
  import SearchInput from "../parts/entity/SearchInput.svelte";
  import { customerFilterItems, fitsSegmentedStatus, segmentedStatusItems, yearFilterItems } from "./list-support";

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
    /** Further toolbar controls after the selects, e.g. a filter menu. */
    children?: Snippet;
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
    children,
  }: Props = $props();

  const segmented = $derived(fitsSegmentedStatus(statusItems));
  const yearItems = $derived(yearFilterItems(years));
  const counterpartyItems = $derived(customerFilterItems(customers, counterparty.allLabel));
</script>

<ListToolbar>
  <SearchInput
    bind:value={search}
    placeholder="Nummer oder {counterparty.label} suchen"
    class="min-w-[200px] flex-1 basis-[240px] max-w-[300px]"
  />
  {#if segmented}
    <Segmented
      bind:value={() => status, (value) => (status = value as S)}
      items={segmentedStatusItems(statusItems)}
      ariaLabel="Status"
    />
  {:else}
    <Select bind:value={status} items={statusItems} aria-label="Status" class="w-[150px]" />
  {/if}
  <Select bind:value={year} items={yearItems} aria-label="Jahr" class="w-[120px]" />
  <!-- One group, so a narrow toolbar moves these controls to the next row together instead of leaving one behind. -->
  <div class="flex flex-wrap items-center gap-2">
    <Select bind:value={customerId} items={counterpartyItems} aria-label={counterparty.label} class="w-[190px]" />
    {@render children?.()}
  </div>
</ListToolbar>
