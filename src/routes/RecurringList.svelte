<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { link, push } from "svelte-spa-router";
  import {
    listRecurring,
    deleteRecurring,
    toggleActive,
    type RecurringListRow,
  } from "$lib/db/recurring";
  import { formatDate, nowUnix } from "$lib/utils/date";
  import { applySort } from "$lib/utils/sort";
  import {
    Badge,
    Button,
    DropdownItem,
    ConfirmDialog,
    toast,
    PageHeader,
    QueryBoundary,
    StatusBadge,
  } from "$lib/ui";
  import { Plus, PowerOff, Power } from "$lib/brand-icons";
  import { WIDE_ONLY } from "./invoice/list-support";
  import InvoiceTabs from "./parts/list/InvoiceTabs.svelte";
  import ListSummary from "./parts/list/ListSummary.svelte";
  import { countSummary } from "./parts/list/list-summary";
  import ListEmptyState from "./parts/entity/ListEmptyState.svelte";
  import RowActionsMenu from "./parts/entity/RowActionsMenu.svelte";
  import { createDeleteFlow } from "./parts/entity/delete-flow.svelte";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import {
    RECURRING_INTERVAL_LABEL,
    generateInvoiceAndOpen,
    generatingRecurringIds,
  } from "./parts/entity/recurring";
  import SortableHeaderRow, { type SortColumn } from "./parts/entity/SortableHeaderRow.svelte";
  import { RECURRING_STATE, recurringState } from "./parts/entity/status";

  const templates = createQueryState<RecurringListRow[]>([], listRecurring);
  $effect(() => {
    templates.reload();
  });

  type SortKey = "name" | "customer" | "interval" | "nextDueDate" | "active";
  const sort = createListSort<SortKey>("recurring", { key: "nextDueDate", dir: "asc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "name", label: "Serie", class: "whitespace-nowrap" },
    { key: "customer", label: "Kunde", class: "w-full" },
    { key: "interval", label: "Rhythmus", class: `${WIDE_ONLY} whitespace-nowrap` },
    { key: "nextDueDate", label: "Nächste Rechnung", class: "whitespace-nowrap" },
    { key: "active", label: "Status", class: "whitespace-nowrap" },
  ];
  const sortedTemplates = $derived(
    applySort(templates.data, sort.state, {
      name: (r) => r.name,
      customer: (r) => r.customerName,
      interval: (r) => r.interval,
      nextDueDate: (r) => r.nextDueDate,
      active: (r) => (r.active ? 1 : 0),
    }),
  );

  // The series count in the tabs changes only when a series is deleted.
  let deletions = $state(0);
  async function reloadAfterDelete() {
    await templates.reload();
    deletions++;
  }

  const deletion = createDeleteFlow<RecurringListRow>({
    remove: (row) => deleteRecurring(row.id),
    entityLabel: "Wiederkehrende Rechnung",
    reload: reloadAfterDelete,
  });

  function isDue(row: RecurringListRow): boolean {
    return row.nextDueDate <= nowUnix();
  }

  function editTemplate(row: RecurringListRow) {
    push(`/recurring/${row.id}`);
  }

  async function onToggle(row: RecurringListRow) {
    try {
      await toggleActive(row.id, !row.active);
      await templates.reload();
      toast.success(row.active ? "Wiederkehrende Rechnung pausiert" : "Wiederkehrende Rechnung aktiviert");
    } catch (e) {
      toast.error("Fehler", errorMessage(e));
    }
  }
</script>

<PageHeader title="Rechnungen">
  {#snippet actions()}
    <Button href="/recurring/new">
      <Plus class="size-4" />
      Neue Serie
    </Button>
  {/snippet}
</PageHeader>

<InvoiceTabs active="recurring" refreshKey={deletions} />

<p class="mb-4 text-[13px] text-muted-foreground">
  Serien sind Vorlagen für Retainer oder Abos. Die Rechnung erzeugst du pro Fälligkeit selbst.
</p>

<QueryBoundary query={templates} isEmpty={templates.data.length === 0}>
  {#snippet empty()}
    <ListEmptyState
      filtered={false}
      emptyMessage="Noch keine Serien angelegt."
      createLabel="Neue Serie"
      onCreate={() => push("/recurring/new")}
    />
  {/snippet}
  <table class="data-list">
    <SortableHeaderRow {sort} {columns} actionsColumn />
    <tbody>
      {#each sortedTemplates as row (row.id)}
        <tr class="cursor-pointer" onclick={() => editTemplate(row)}>
          <td class="whitespace-nowrap">
            <a
              href={`/recurring/${row.id}`}
              use:link
              onclick={(e) => e.stopPropagation()}
              class="font-semibold hover:underline focus-visible:underline"
              title={row.name}
            >
              {row.name}
            </a>
          </td>
          <td class="w-full text-muted-foreground"><span class="line-clamp-2" title={row.customerName}>{row.customerName}</span></td>
          <td class="{WIDE_ONLY} whitespace-nowrap">{RECURRING_INTERVAL_LABEL[row.interval]}</td>
          <td class="whitespace-nowrap">
            <span class="inline-flex items-center gap-2 tabular-nums">
              {formatDate(row.nextDueDate)}
              {#if row.active && isDue(row)}
                <Badge variant="open">Fällig</Badge>
              {/if}
            </span>
            {#if row.lastGeneratedAt}
              <div class="text-xs text-muted-foreground tabular-nums">zuletzt: {formatDate(row.lastGeneratedAt)}</div>
            {/if}
          </td>
          <td class="whitespace-nowrap">
            <StatusBadge status={recurringState(row.active)} table={RECURRING_STATE} />
          </td>
          <td class="text-right whitespace-nowrap" onclick={(e) => e.stopPropagation()}>
            <div class="inline-flex items-center gap-1">
              {#if row.active && isDue(row)}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={generatingRecurringIds.has(row.id)}
                  onclick={() => generateInvoiceAndOpen(row.id)}
                >
                  Rechnung erzeugen
                </Button>
              {/if}
              <RowActionsMenu onEdit={() => editTemplate(row)} onDelete={() => deletion.ask(row)}>
                {#snippet extraItems()}
                  <DropdownItem onSelect={() => onToggle(row)}>
                    {#if row.active}
                      <PowerOff />
                      Pausieren
                    {:else}
                      <Power />
                      Aktivieren
                    {/if}
                  </DropdownItem>
                {/snippet}
              </RowActionsMenu>
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <ListSummary segments={countSummary(sortedTemplates.length, "Serie", "Serien")} />
</QueryBoundary>

<ConfirmDialog
  bind:open={deletion.open}
  title="Wiederkehrende Rechnung löschen?"
  description="Die wiederkehrende Rechnung wird unwiderruflich entfernt. Bereits erzeugte Rechnungen bleiben bestehen."
  confirmLabel="Löschen"
  destructive
  onConfirm={deletion.confirm}
/>
