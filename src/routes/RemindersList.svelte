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
  import { centsToEur } from "$lib/utils/money";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate } from "$lib/utils/date";
  import { applySort } from "$lib/utils/sort";
  import { Button, Card, Badge, EmptyState, PageHeader, QueryBoundary, StatusBadge } from "$lib/ui";
  import { Plus, AlertTriangle } from "$lib/brand-icons";
  import { pluralize } from "./parts/entity/format";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import SortableHeaderRow, { type SortColumn } from "./parts/entity/SortableHeaderRow.svelte";
  import { REMINDER_STATUS } from "./parts/entity/status";
  import { suggestNextLevel } from "./parts/reminder/reminder-level";

  const SEVERE_OVERDUE_DAYS = 30;

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
    { key: "issueDate", label: "Datum", class: "hidden @3xl:table-cell whitespace-nowrap" },
    { key: "invoice", label: "Rechnung", class: "whitespace-nowrap" },
    { key: "customer", label: "Kunde", class: "min-w-32" },
    { key: "level", label: "Stufe", class: "hidden @3xl:table-cell whitespace-nowrap" },
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
</script>

<PageHeader
  title="Mahnungen"
  subtitle="{overview.data.reminders.length} {pluralize(overview.data.reminders.length, "Mahnung", "Mahnungen")} · {overview.data.overdue.length} {pluralize(overview.data.overdue.length, "überfällige Rechnung", "überfällige Rechnungen")}"
/>

<QueryBoundary query={overview}>
  {#if overview.data.overdue.length > 0}
    <section class="mb-8">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
        <AlertTriangle class="size-4 text-warning" />
        Überfällige Rechnungen
      </h2>
      <Card class="overflow-hidden py-0">
        <table class="w-full text-sm">
          <thead class="bg-muted/40 text-left">
            <tr class="text-xs uppercase tracking-wider text-muted-foreground">
              <th class="px-4 py-3 font-medium whitespace-nowrap">Rechnung</th>
              <th class="px-4 py-3 font-medium min-w-32">Kunde</th>
              <th class="px-4 py-3 font-medium text-right whitespace-nowrap">Offen</th>
              <th class="hidden @3xl:table-cell px-4 py-3 font-medium whitespace-nowrap">Fällig</th>
              <th class="px-4 py-3 font-medium whitespace-nowrap">Tage</th>
              <th class="hidden @4xl:table-cell px-4 py-3 font-medium whitespace-nowrap">Bestehend</th>
              <th class="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody class="stagger">
            {#each overview.data.overdue as o (o.invoice.id)}
              {@const nextLevel = suggestNextLevel(o.existingReminderLevels)}
              <tr class="border-t hover:bg-muted/30 transition-colors">
                <td class="px-4 py-3 font-mono text-xs whitespace-nowrap">
                  <a href={`/invoices/${o.invoice.id}`} use:link class="hover:underline">{o.invoice.number}</a>
                </td>
                <td class="px-4 py-3 min-w-32"><span class="line-clamp-2" title={o.customerName}>{o.customerName}</span></td>
                <td class="px-4 py-3 text-right font-mono whitespace-nowrap">{formatMoney(remindableAmountCents(o.invoice), o.invoice.currency)}</td>
                <td class="hidden @3xl:table-cell px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(o.invoice.dueDate)}</td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <Badge variant={o.daysOverdue > SEVERE_OVERDUE_DAYS ? "destructive" : "warning"}>
                    {o.daysOverdue} Tage
                  </Badge>
                </td>
                <td class="hidden @4xl:table-cell px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {#if o.existingReminderLevels.length === 0}—
                  {:else}Stufe {o.existingReminderLevels.join(", ")}
                  {/if}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="outline"
                    title={levelLabel(nextLevel)}
                    aria-label={levelLabel(nextLevel)}
                    onclick={() => push(`/reminders/new/${o.invoice.id}/${nextLevel}`)}
                  >
                    <Plus class="size-3.5" />
                    <span class="hidden @3xl:inline">{levelLabel(nextLevel)}</span>
                  </Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </Card>
    </section>
  {/if}

  <section>
    <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
      Alle Mahnungen
    </h2>
    {#if overview.data.reminders.length === 0}
      <EmptyState message="Noch keine Mahnungen erstellt." />
    {:else}
      <Card class="overflow-hidden py-0">
        <table class="w-full text-sm">
          <SortableHeaderRow {sort} {columns} />
          <tbody class="stagger">
            {#each sortedReminders as r (r.id)}
              <tr
                class="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                onclick={() => push(`/reminders/${r.id}`)}
              >
                <td class="px-4 py-3 font-mono text-xs whitespace-nowrap">{r.number}</td>
                <td class="hidden @3xl:table-cell px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(r.issueDate)}</td>
                <td class="px-4 py-3 font-mono text-xs whitespace-nowrap">{r.invoiceNumber}</td>
                <td class="px-4 py-3 min-w-32"><span class="line-clamp-2" title={r.customerName}>{r.customerName}</span></td>
                <td class="hidden @3xl:table-cell px-4 py-3 whitespace-nowrap">{levelLabel(r.level as ReminderLevel)}</td>
                <td class="px-4 py-3 text-right font-mono whitespace-nowrap">{centsToEur(r.totalDueCents)}</td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={r.status} table={REMINDER_STATUS} />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </Card>
    {/if}
  </section>
</QueryBoundary>
