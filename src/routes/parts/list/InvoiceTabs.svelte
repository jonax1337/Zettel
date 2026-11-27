<script lang="ts">
  import { listInvoices } from "$lib/db/invoices";
  import { listRecurring } from "$lib/db/recurring";
  import { Tabs } from "$lib/ui";
  import { nowUnix } from "$lib/utils/date";
  import { createQueryState } from "../entity/query-state.svelte";
  import { countInvoiceTabs, invoiceTabHref, invoiceTabItems, type InvoiceTab, type InvoiceTabCounts } from "./invoice-tabs";

  type Props = {
    active: InvoiceTab;
    /** Counts load on mount and again whenever this value changes, e.g. after a bulk action. */
    refreshKey?: number;
  };
  let { active, refreshKey }: Props = $props();

  const counts = createQueryState<InvoiceTabCounts | null>(null, async () => {
    const [invoices, recurring] = await Promise.all([listInvoices(), listRecurring()]);
    return countInvoiceTabs(invoices, recurring.length, nowUnix());
  });

  $effect(() => {
    void refreshKey;
    counts.reload();
  });
</script>

<Tabs items={invoiceTabItems(counts.data)} active={invoiceTabHref(active)} ariaLabel="Rechnungen" />
