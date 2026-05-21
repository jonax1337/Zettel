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
  import { Button, Card, Badge, SortableTh } from "$lib/ui";
  import { Plus, AlertTriangle } from "@lucide/svelte";
  import { applySort, loadSortState, saveSortState, type SortState } from "$lib/utils/sort";

  let reminders = $state<ReminderListRow[]>([]);
  let overdue = $state<OverdueInvoice[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function reload() {
    loading = true;
    try {
      [reminders, overdue] = await Promise.all([listReminders(), listOverdueInvoices()]);
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    reload();
  });

  function suggestedLevel(existing: ReminderLevel[]): ReminderLevel {
    if (existing.includes(3)) return 3;
    if (existing.includes(2)) return 3;
    if (existing.includes(1)) return 2;
    return 1;
  }

  type SortKey = "number" | "issueDate" | "invoice" | "customer" | "level" | "totalDue" | "status";
  let sort = $state<SortState<SortKey>>(loadSortState<SortKey>("reminders", { key: "issueDate", dir: "desc" }));
  function setSort(key: SortKey, dir: SortState<SortKey>["dir"]) {
    sort = { key: dir === null ? null : key, dir };
    saveSortState("reminders", sort);
  }
  const sortedReminders = $derived(
    applySort(reminders, sort, {
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
      {reminders.length} {reminders.length === 1 ? "Mahnung" : "Mahnungen"} · {overdue.length} überfällige Rechnung{overdue.length === 1 ? "" : "en"}
    </p>
  </div>
</header>

{#if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  {#if overdue.length > 0}
    <section class="mb-8">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
        <AlertTriangle class="size-4 text-warning" />
        Überfällige Rechnungen
      </h2>
      <Card class="overflow-hidden py-0">
        <table class="w-full text-sm">
          <thead class="bg-muted/40 text-left">
            <tr class="text-xs uppercase tracking-wider text-muted-foreground">
              <th class="px-4 py-3 font-medium">Rechnung</th>
              <th class="px-4 py-3 font-medium">Kunde</th>
              <th class="px-4 py-3 font-medium text-right">Betrag</th>
              <th class="px-4 py-3 font-medium">Fällig</th>
              <th class="px-4 py-3 font-medium">Tage</th>
              <th class="px-4 py-3 font-medium">Bestehend</th>
              <th class="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody class="stagger">
            {#each overdue as o (o.invoice.id)}
              {@const lvl = suggestedLevel(o.existingReminderLevels)}
              <tr class="border-t hover:bg-muted/30 transition-colors">
                <td class="px-4 py-3 font-mono text-xs">{o.invoice.number}</td>
                <td class="px-4 py-3">{o.customerName}</td>
                <td class="px-4 py-3 text-right font-mono">{centsToEur(o.invoice.total)}</td>
                <td class="px-4 py-3 text-muted-foreground text-xs">{formatDate(o.invoice.dueDate)}</td>
                <td class="px-4 py-3">
                  <Badge variant={o.daysOverdue > 30 ? "destructive" : "warning"}>
                    {o.daysOverdue} Tage
                  </Badge>
                </td>
                <td class="px-4 py-3 text-xs text-muted-foreground">
                  {#if o.existingReminderLevels.length === 0}—
                  {:else}Stufe {o.existingReminderLevels.join(", ")}
                  {/if}
                </td>
                <td class="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() => push(`/reminders/new/${o.invoice.id}/${lvl}`)}
                  >
                    <Plus class="size-3.5" />
                    {levelLabel(lvl)}
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
    {#if reminders.length === 0}
      <Card>
        <div class="py-12 text-center text-sm text-muted-foreground">
          Noch keine Mahnungen erstellt.
        </div>
      </Card>
    {:else}
      <Card class="overflow-hidden py-0">
        <table class="w-full text-sm">
          <thead class="bg-muted/40 text-left">
            <tr>
              <SortableTh column="number" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Nummer</SortableTh>
              <SortableTh column="issueDate" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Datum</SortableTh>
              <SortableTh column="invoice" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Rechnung</SortableTh>
              <SortableTh column="customer" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Kunde</SortableTh>
              <SortableTh column="level" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Stufe</SortableTh>
              <SortableTh column="totalDue" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} align="right" class="px-4 py-3 text-right">Zu zahlen</SortableTh>
              <SortableTh column="status" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Status</SortableTh>
            </tr>
          </thead>
          <tbody class="stagger">
            {#each sortedReminders as r (r.id)}
              <tr
                class="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                onclick={() => push(`/reminders/${r.id}`)}
              >
                <td class="px-4 py-3 font-mono text-xs">{r.number}</td>
                <td class="px-4 py-3 text-muted-foreground">{formatDate(r.issueDate)}</td>
                <td class="px-4 py-3 font-mono text-xs">{r.invoiceNumber}</td>
                <td class="px-4 py-3">{r.customerName}</td>
                <td class="px-4 py-3">{levelLabel(r.level as ReminderLevel)}</td>
                <td class="px-4 py-3 text-right font-mono">{centsToEur(r.totalDueCents)}</td>
                <td class="px-4 py-3">
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
