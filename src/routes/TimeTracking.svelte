<script lang="ts">
  import { untrack } from "svelte";
  import { push, replace, router } from "svelte-spa-router";
  import { listProjects, type ProjectListRow } from "$lib/db/projects";
  import {
    deleteTimeEntry,
    getRunningTimer,
    listTimeEntries,
    type TimeEntryListRow,
    type TimeEntryStatusFilter,
  } from "$lib/db/time-entries";
  import { summarizeEntries } from "$lib/time/summary";
  import { formatDuration } from "$lib/time/duration";
  import { Button, BulkActionBar, ConfirmDialog, EmptyState, Label, PageHeader, QueryBoundary, Select } from "$lib/ui";
  import { FilePlus2, Plus } from "$lib/brand-icons";
  import { ALL, customerFilterItems, numberOrAll } from "./invoice/list-support";
  import { queryParam } from "./invoice/route-query";
  import { createRowSelection } from "./invoice/list-selection.svelte";
  import { pluralize } from "./parts/entity/format";
  import { createDeleteFlow } from "./parts/entity/delete-flow.svelte";
  import { createListFilters } from "./parts/entity/list-filters.svelte";
  import ListEmptyState from "./parts/entity/ListEmptyState.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import BillingDialog from "./time/BillingDialog.svelte";
  import { groupByDay } from "./time/day-groups";
  import EntryList from "./time/EntryList.svelte";
  import PeriodBar from "./time/PeriodBar.svelte";
  import { periodContaining } from "./time/period";
  import { customerFilterOptions, projectFilterItems, selectableProjects } from "./time/project-options";
  import { billingBlocker, isBillable } from "./time/selection";
  import TimeEntryDialog from "./time/TimeEntryDialog.svelte";
  import TimerCard from "./time/TimerCard.svelte";
  import TimeSummaryCards from "./time/TimeSummaryCards.svelte";

  const STATUS_ITEMS: { value: TimeEntryStatusFilter; label: string }[] = [
    { value: "all", label: "Alle Status" },
    { value: "open", label: "Offen" },
    { value: "billed", label: "Abgerechnet" },
  ];

  const filters = createListFilters<{
    customerId: string;
    projectId: string;
    status: TimeEntryStatusFilter;
  }>("time", { customerId: ALL, projectId: ALL, status: "all" });
  const f = filters.values;

  let period = $state(periodContaining("week", new Date()));

  const projects = createQueryState<ProjectListRow[]>([], () => listProjects({ includeArchived: true }));
  const running = createQueryState<TimeEntryListRow | null>(null, getRunningTimer);
  const entries = createQueryState<TimeEntryListRow[]>([], () =>
    listTimeEntries({
      period: { start: period.start, end: period.end },
      customerId: numberOrAll(f.customerId),
      projectId: numberOrAll(f.projectId),
      status: f.status,
    }),
  );
  $effect(() => {
    projects.reload();
    running.reload();
  });
  $effect(() => {
    entries.reload();
  });

  async function reloadAll() {
    await Promise.all([entries.reload(), running.reload(), projects.reload()]);
  }

  const customerItems = $derived(customerFilterItems(customerFilterOptions(projects.data)));
  const projectItems = $derived(projectFilterItems(projects.data, f.customerId));
  // Narrowing the customer can leave the chosen project outside it.
  $effect(() => {
    if (!projects.loading && !projectItems.some((item) => item.value === f.projectId)) f.projectId = ALL;
  });

  const groups = $derived(groupByDay(entries.data));
  const summary = $derived(summarizeEntries(entries.data));
  const selection = createRowSelection(() => entries.data.filter(isBillable));
  const blocker = $derived(billingBlocker(selection.selected));
  const selectionLabel = $derived(pluralize(selection.selected.length, "Eintrag", "Einträge"));

  const selectable = $derived(selectableProjects(projects.data));
  const defaultProjectId = $derived(
    selectable.some((p) => String(p.id) === f.projectId) ? f.projectId : String(selectable[0]?.id ?? ""),
  );

  let entryDialogOpen = $state(false);
  let editingEntry = $state<TimeEntryListRow | null>(null);
  let billingOpen = $state(false);
  let billingEntryIds = $state<number[]>([]);

  function openCreate() {
    editingEntry = null;
    entryDialogOpen = true;
  }

  function openEdit(entry: TimeEntryListRow) {
    editingEntry = entry;
    entryDialogOpen = true;
  }

  function openBilling() {
    billingEntryIds = selection.selected.map((entry) => entry.id);
    billingOpen = true;
  }

  async function afterBilled() {
    selection.clear();
    await reloadAll();
  }

  const deletion = createDeleteFlow<TimeEntryListRow>({
    remove: (entry) => deleteTimeEntry(entry.id),
    entityLabel: "Zeiteintrag",
    reload: reloadAll,
  });

  // The command palette's "Zeit erfassen" arrives as /time?new=1, also while this page is already open.
  // Clearing the query afterwards lets the next palette use change it again.
  $effect(() => {
    if (projects.loading || queryParam(router.querystring, "new") !== "1") return;
    untrack(() => {
      if (selectable.length > 0) openCreate();
    });
    replace("/time");
  });
</script>

<PageHeader
  title="Zeiterfassung"
  subtitle="{entries.data.length} {pluralize(entries.data.length, 'Eintrag', 'Einträge')} · {formatDuration(summary.totalMinutes)} Std"
>
  {#snippet actions()}
    <div class="flex gap-2">
      <Button variant="outline" href="/time/projects">Projekte</Button>
      <Button onclick={openCreate} disabled={selectable.length === 0}>
        <Plus />
        Zeit erfassen
      </Button>
    </div>
  {/snippet}
</PageHeader>

{#if !projects.loading && !projects.error && projects.data.length === 0}
  <EmptyState
    message="Zeiten werden pro Projekt erfasst. Lege zuerst ein Projekt mit Kunde und Stundensatz an."
    actionLabel="Projekt anlegen"
    onAction={() => push("/time/projects")}
  />
{:else}
  <TimerCard projects={projects.data} running={running.data} onChanged={reloadAll} />

  <PeriodBar bind:period />

  <div class="mb-5 grid grid-cols-3 gap-3">
    <div class="flex flex-col gap-1.5">
      <Label class="text-xs text-muted-foreground">Kunde</Label>
      <Select bind:value={f.customerId} items={customerItems} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label class="text-xs text-muted-foreground">Projekt</Label>
      <Select bind:value={f.projectId} items={projectItems} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label class="text-xs text-muted-foreground">Status</Label>
      <Select bind:value={f.status} items={STATUS_ITEMS} />
    </div>
  </div>

  <TimeSummaryCards {summary} />

  <QueryBoundary query={entries} isEmpty={entries.data.length === 0}>
    {#snippet empty()}
      <ListEmptyState
        filtered={filters.isFiltered}
        onResetFilters={filters.reset}
        filteredMessage="Keine Einträge für diese Filter."
        emptyMessage="In diesem Zeitraum sind noch keine Zeiten erfasst."
        createLabel="Zeit erfassen"
        onCreate={openCreate}
      />
    {/snippet}
    <EntryList
      {groups}
      isSelected={selection.isSelected}
      onToggle={selection.toggle}
      onEdit={openEdit}
      onDelete={deletion.ask}
    />
  </QueryBoundary>
{/if}

<BulkActionBar count={selection.selected.length} label={selectionLabel} onClear={selection.clear}>
  <Button size="sm" onclick={openBilling} disabled={blocker !== null}>
    <FilePlus2 class="size-3.5" />
    Abrechnen
  </Button>
  {#if blocker}
    <span class="max-w-64 text-xs text-warning">{blocker}</span>
  {/if}
</BulkActionBar>

<TimeEntryDialog
  bind:open={entryDialogOpen}
  projects={projects.data}
  entry={editingEntry}
  {defaultProjectId}
  onSaved={reloadAll}
/>

<BillingDialog
  bind:open={billingOpen}
  entryIds={billingEntryIds}
  customerName={selection.selected[0]?.customerName ?? ""}
  onBilled={afterBilled}
/>

<ConfirmDialog
  bind:open={deletion.open}
  title="Zeiteintrag löschen?"
  description="Der Eintrag wird unwiderruflich entfernt."
  confirmLabel="Löschen"
  destructive
  onConfirm={deletion.confirm}
/>
