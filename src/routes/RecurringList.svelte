<script lang="ts">
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
    Button,
    Card,
    DropdownItem,
    ConfirmDialog,
    toast,
    EmptyState,
    PageHeader,
    QueryBoundary,
    StatusBadge,
  } from "$lib/ui";
  import { Plus, FileText, PowerOff, Power } from "$lib/brand-icons";
  import RowActionsMenu from "./parts/entity/RowActionsMenu.svelte";
  import { createDeleteFlow } from "./parts/entity/delete-flow.svelte";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import { RECURRING_INTERVAL_LABEL, generateInvoiceAndOpen } from "./parts/entity/recurring";
  import SortableHeaderRow, { type SortColumn } from "./parts/entity/SortableHeaderRow.svelte";
  import { RECURRING_STATE, recurringState } from "./parts/entity/status";

  const templates = createQueryState<RecurringListRow[]>([], listRecurring);
  $effect(() => {
    templates.reload();
  });

  type SortKey = "name" | "customer" | "interval" | "nextDueDate" | "active";
  const sort = createListSort<SortKey>("recurring", { key: "nextDueDate", dir: "asc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "name", label: "Name", class: "min-w-32" },
    { key: "customer", label: "Kunde", class: "hidden @3xl:table-cell min-w-32" },
    { key: "interval", label: "Intervall", class: "hidden @3xl:table-cell whitespace-nowrap" },
    { key: "nextDueDate", label: "Nächste Fälligkeit", class: "whitespace-nowrap" },
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

  const deletion = createDeleteFlow<RecurringListRow>({
    remove: (row) => deleteRecurring(row.id),
    entityLabel: "Vorlage",
    reload: templates.reload,
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
      toast.success(row.active ? "Vorlage pausiert" : "Vorlage aktiviert");
    } catch (e) {
      toast.error("Fehler", String(e));
    }
  }
</script>

<PageHeader
  title="Wiederkehrende Rechnungen"
  subtitle="Vorlagen für Retainer- oder Abo-Modelle. Erzeugung erfolgt manuell pro Fälligkeit."
>
  {#snippet actions()}
    <Button href="/recurring/new">
      <Plus class="size-4" />
      Neue Vorlage
    </Button>
  {/snippet}
</PageHeader>

<QueryBoundary query={templates} isEmpty={templates.data.length === 0}>
  {#snippet empty()}
    <EmptyState message="Noch keine Vorlagen. Erstelle die erste über „Neue Vorlage“." />
  {/snippet}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <SortableHeaderRow {sort} {columns} actionsColumn />
      <tbody class="stagger">
        {#each sortedTemplates as row (row.id)}
          <tr class="border-t hover:bg-muted/30 transition-colors">
            <td class="px-4 py-3 min-w-32">
              <a href={`/recurring/${row.id}`} use:link class="font-medium hover:underline" title={row.name}>
                <span class="line-clamp-2">{row.name}</span>
              </a>
            </td>
            <td class="hidden @3xl:table-cell px-4 py-3 text-muted-foreground min-w-32"><span class="line-clamp-2" title={row.customerName}>{row.customerName}</span></td>
            <td class="hidden @3xl:table-cell px-4 py-3 whitespace-nowrap">{RECURRING_INTERVAL_LABEL[row.interval]}</td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class={isDue(row) && row.active ? "text-warning font-medium" : ""}>
                {formatDate(row.nextDueDate)}
              </span>
              {#if row.lastGeneratedAt}
                <div class="text-xs text-muted-foreground">
                  zuletzt: {formatDate(row.lastGeneratedAt)}
                </div>
              {/if}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <StatusBadge status={recurringState(row.active)} table={RECURRING_STATE} />
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <div class="inline-flex items-center gap-1">
                {#if row.active && isDue(row)}
                  <Button size="sm" onclick={() => generateInvoiceAndOpen(row.id)}>
                    <FileText class="size-3.5" />
                    Jetzt erzeugen
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
  </Card>
</QueryBoundary>

<ConfirmDialog
  bind:open={deletion.open}
  title="Vorlage löschen?"
  description="Die Vorlage wird unwiderruflich entfernt. Bereits erzeugte Rechnungen bleiben bestehen."
  confirmLabel="Löschen"
  destructive
  onConfirm={deletion.confirm}
/>
