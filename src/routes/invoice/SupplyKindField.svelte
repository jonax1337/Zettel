<script lang="ts">
  import type { SupplyKind } from "$lib/db/invoices";
  import { Label, Select } from "$lib/ui";
  import { type CrossBorderType, SUPPLY_KIND_HINT, SUPPLY_KIND_ITEMS } from "./supply-kind";

  let {
    value = $bindable(),
    reverseChargeType = "intra_eu",
    disabled = false,
  }: { value: SupplyKind; reverseChargeType?: CrossBorderType; disabled?: boolean } = $props();
</script>

<div class="col-span-2 flex flex-col gap-1.5">
  <Label>Art des Umsatzes</Label>
  <Select bind:value items={SUPPLY_KIND_ITEMS} {disabled} />
  <p class="text-xs text-muted-foreground">{SUPPLY_KIND_HINT[reverseChargeType][value]}</p>
</div>
