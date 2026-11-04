<script lang="ts">
  import { push } from "svelte-spa-router";
  import {
    listReminders,
    listOverdueInvoices,
    levelLabel,
    type ReminderListRow,
    type OverdueInvoice,
  } from "$lib/db/reminders";
  import type { ReminderLevel } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";
  import { applySort } from "$lib/utils/sort";
  import { Button, Card, Badge, SortableTh, EmptyState } from "$lib/ui";
  import { Plus, AlertTriangle } from "$lib/brand-icons";
  import { pluralize } from "./parts/entity/format";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
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

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Mahnungen</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {overview.data.reminders.length} {pluralize(overview.data.reminders.length, "Mahnung", "Mahnungen")} · {overview.data.overdue.length} {pluralize(overview.data.overdue.length, "überfällige Rechnung", "überfällige Rechnungen")}
    </p>
  </div>
</header>

{#if overview.error}
  <p class="text-sm text-destructive">Fehler: {overview.error}</p>
{:else if overview.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
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
              <th class="px-4 py-3 font-medium text-right whitespace-nowrap">Betrag</th>
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
                <td class="px-4 py-3 font-mono text-xs whitespace-nowrap">{o.invoice.number}</td>
                <td class="px-4 py-3 min-w-32"><span class="line-clamp-2" title={o.customerName}>{o.customerName}</span></td>
                <td class="px-4 py-3 text-right font-mono whitespace-nowrap">{centsToEur(o.invoice.total)}</td>
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
          <thead class="bg-muted/40 text-left">
            <tr>
              <SortableTh column="number" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-4 py-3 whitespace-nowrap">Nummer</SortableTh>
              <SortableTh column="issueDate" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-4 py-3 whitespace-nowrap">Datum</SortableTh>
              <SortableTh column="invoice" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-4 py-3 whitespace-nowrap">Rechnung</SortableTh>
              <SortableTh column="customer" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-4 py-3 min-w-32">Kunde</SortableTh>
              <SortableTh column="level" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-4 py-3 whitespace-nowrap">Stufe</SortableTh>
              <SortableTh column="totalDue" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} align="right" class="px-4 py-3 text-right whitespace-nowrap">Zu zahlen</SortableTh>
              <SortableTh column="status" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-4 py-3 whitespace-nowrap">Status</SortableTh>
            </tr>
          </thead>
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
                  <Badge variant={r.status === "sent" ? "success" : "secondary"}>
                    {r.status === "sent" ? "Versendet" : "Entwurf"}
                  </Badge>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </Card>
    {/if}
  </section>
{/if}
