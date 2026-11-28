<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    listReminders,
    listOverdueInvoices,
    levelLabel,
    remindableAmountCents,
    type ReminderListRow,
    type OverdueInvoice,
  } from "$lib/db/reminders";
  import type { ReminderLevel } from "$lib/db/schema";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate } from "$lib/utils/date";
  import { applySort } from "$lib/utils/sort";
  import { Button, Badge, PageHeader, QueryBoundary, StatusBadge } from "$lib/ui";
  import { Plus } from "$lib/brand-icons";
  import { pluralize } from "./parts/entity/format";
  import { EXTRA_WIDE_ONLY, WIDE_ONLY, overdueSinceLabel } from "./invoice/list-support";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import SortableHeaderRow, { type SortColumn } from "./parts/entity/SortableHeaderRow.svelte";
  import { REMINDER_STATUS } from "./parts/entity/status";
  import { suggestNextLevel } from "./parts/reminder/reminder-level";
  import InvoiceTabs from "./parts/list/InvoiceTabs.svelte";
  import ListSummary from "./parts/list/ListSummary.svelte";
  import { formatTotals, reminderSummary, sumByCurrency } from "./parts/list/list-summary";
  import ListEmptyState from "./parts/entity/ListEmptyState.svelte";

  type ReminderOverview = { reminders: ReminderListRow[]; overdue: OverdueInvoice[] };

  const overview = createQueryState<ReminderOverview>({ reminders: [], overdue: [] }, async () => {
    const [reminders, overdue] = await Promise.all([listReminders(), listOverdueInvoices()]);
    return { reminders, overdue };
  });
  $effect(() => {
    overview.reload();
  });

  type SortKey = "number" | "issueDate" | "invoice" | "customer" | "level" | "totalDue" | "status";
  const sort = createListSort<SortKey>("reminders", { key: "issueDate", dir: "desc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "number", label: "Nummer", class: "whitespace-nowrap" },
    { key: "invoice", label: "Rechnung", class: "whitespace-nowrap" },
    { key: "customer", label: "Kunde", class: "w-full" },
    { key: "level", label: "Stufe", class: "whitespace-nowrap" },
    { key: "issueDate", label: "Datum", class: `${WIDE_ONLY} whitespace-nowrap` },
    { key: "totalDue", label: "Zu zahlen", align: "right", class: "text-right whitespace-nowrap" },
    { key: "status", label: "Status", class: "whitespace-nowrap" },
  ];
  const sortedReminders = $derived(
    applySort(overview.data.reminders, sort.state, {
      number: (r) => r.number,
      issueDate: (r) => r.issueDate,
      invoice: (r) => r.invoiceNumber,
      customer: (r) => r.customerName,
      level: (r) => r.level,
      totalDue: (r) => r.totalDueCents,
      status: (r) => r.status,
    }),
  );

  const overdueHint = $derived.by(() => {
    const { overdue } = overview.data;
    const open = formatTotals(
      sumByCurrency(
        overdue.map((o) => ({ currency: o.invoice.currency, cents: remindableAmountCents(o.invoice) })),
      ),
    );
    return `${overdue.length} ${pluralize(overdue.length, "Rechnung", "Rechnungen")}, ${open}`;
  });
</script>

<PageHeader title="Rechnungen">
  {#snippet actions()}
    <Button onclick={() => push("/invoices/new")}>
      <Plus />
      Neue Rechnung
    </Button>
  {/snippet}
</PageHeader>

<InvoiceTabs active="reminders" />

<QueryBoundary query={overview}>
  <section class="mb-9">
    <div class="mb-2.5 flex items-baseline gap-2.5">
      <h2>Jetzt mahnen</h2>
      {#if overview.data.overdue.length > 0}
        <span class="text-[13px] text-muted-foreground tabular-nums">{overdueHint}</span>
      {/if}
    </div>
    {#if overview.data.overdue.length === 0}
      <p class="text-muted-foreground">Keine Rechnung ist überfällig.</p>
    {:else}
      <table class="data-list">
        <thead>
          <tr>
            <th>Rechnung</th>
            <th class="w-full">Kunde</th>
            <th class={WIDE_ONLY}>Fällig</th>
            <th>Überfällig seit</th>
            <th class={EXTRA_WIDE_ONLY}>Bisher</th>
            <th class="text-right">Offen</th>
            <th><span class="sr-only">Aktion</span></th>
          </tr>
        </thead>
        <tbody>
          {#each overview.data.overdue as o (o.invoice.id)}
            {@const nextLevel = suggestNextLevel(o.existingReminderLevels)}
            <tr class="cursor-pointer" onclick={() => push(`/invoices/${o.invoice.id}`)}>
              <td class="font-semibold whitespace-nowrap tabular-nums">
                <a
                  href={`/invoices/${o.invoice.id}`}
                  use:link
                  onclick={(e) => e.stopPropagation()}
                  class="hover:underline focus-visible:underline"
                >
                  {o.invoice.number}
                </a>
              </td>
              <td class="w-full"><span class="line-clamp-2" title={o.customerName}>{o.customerName}</span></td>
              <td class="{WIDE_ONLY} text-muted-foreground whitespace-nowrap tabular-nums">{formatDate(o.invoice.dueDate)}</td>
              <td class="whitespace-nowrap">
                <Badge variant="late">
                  {overdueSinceLabel(o.daysOverdue)}
                </Badge>
              </td>
              <td class="{EXTRA_WIDE_ONLY} text-muted-foreground whitespace-nowrap">
                {#if o.existingReminderLevels.length === 0}–
                {:else}{o.existingReminderLevels.map(levelLabel).join(", ")}
                {/if}
              </td>
              <td class="text-right font-semibold whitespace-nowrap tabular-nums">
                {formatMoney(remindableAmountCents(o.invoice), o.invoice.currency)}
              </td>
              <td class="text-right whitespace-nowrap" onclick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="outline"
                  onclick={() => push(`/reminders/new/${o.invoice.id}/${nextLevel}`)}
                >
                  {levelLabel(nextLevel)} erstellen
                </Button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section>
    <div class="mb-2.5 flex items-baseline gap-2.5">
      <h2>Mahnungen</h2>
    </div>
    {#if overview.data.reminders.length === 0}
      <ListEmptyState
        filtered={false}
        emptyMessage="Noch keine Mahnungen erstellt."
        createLabel="Zu den Rechnungen"
        onCreate={() => push("/invoices")}
      />
    {:else}
      <table class="data-list">
        <SortableHeaderRow {sort} {columns} />
        <tbody>
          {#each sortedReminders as r (r.id)}
            <tr class="cursor-pointer" onclick={() => push(`/reminders/${r.id}`)}>
              <td class="font-semibold whitespace-nowrap tabular-nums">
                <a
                  href={`/reminders/${r.id}`}
                  use:link
                  onclick={(e) => e.stopPropagation()}
                  class="hover:underline focus-visible:underline"
                >
                  {r.number}
                </a>
              </td>
              <td class="whitespace-nowrap tabular-nums">{r.invoiceNumber}</td>
              <td class="w-full"><span class="line-clamp-2" title={r.customerName}>{r.customerName}</span></td>
              <td class="whitespace-nowrap">{levelLabel(r.level as ReminderLevel)}</td>
              <td class="{WIDE_ONLY} text-muted-foreground whitespace-nowrap tabular-nums">{formatDate(r.issueDate)}</td>
              <td class="text-right font-semibold whitespace-nowrap tabular-nums">{formatMoney(r.totalDueCents, r.currency)}</td>
              <td class="whitespace-nowrap"><StatusBadge status={r.status} table={REMINDER_STATUS} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <ListSummary segments={reminderSummary(sortedReminders)} />
    {/if}
  </section>
</QueryBoundary>
