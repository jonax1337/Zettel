<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { EMPTY_PROJECT_TIME_FIGURES, loadProjectTimeFigures, type ProjectTimeFigures } from "$lib/db/project-overview";
  import { deleteProject, listProjects, setProjectArchived, type ProjectListRow } from "$lib/db/projects";
  import { formatDuration } from "$lib/time/duration";
  import { centsToEur } from "$lib/utils/money";
  import { WIDE_ONLY } from "./invoice/list-support";
  import {
    Badge,
    Button,
    Checkbox,
    ConfirmDialog,
    DropdownItem,
    DropdownMenu,
    DropdownSeparator,
    Label,
    MoreActionsTrigger,
    PageHeader,
    QueryBoundary,
    toast,
  } from "$lib/ui";
  import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "$lib/brand-icons";
  import { createDeleteFlow } from "./parts/entity/delete-flow.svelte";
  import { createListFilters } from "./parts/entity/list-filters.svelte";
  import ListEmptyState from "./parts/entity/ListEmptyState.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import { pluralize } from "./parts/entity/format";
  import ListSummary from "./parts/list/ListSummary.svelte";
  import { countSummary } from "./parts/list/list-summary";
  import ProjectDialog from "./time/ProjectDialog.svelte";

  const filters = createListFilters<{ includeArchived: boolean }>("time-projects", { includeArchived: false });
  const f = filters.values;

  const projects = createQueryState<ProjectListRow[]>([], () => listProjects({ includeArchived: f.includeArchived }));
  $effect(() => {
    projects.reload();
  });

  const figures = createQueryState<ReadonlyMap<number, ProjectTimeFigures>>(new Map(), loadProjectTimeFigures);
  $effect(() => {
    figures.reload();
  });
  const listQuery = {
    get loading() {
      return projects.loading || figures.loading;
    },
    get error() {
      return projects.error ?? figures.error;
    },
  };
  const hours = (minutes: number) => (minutes === 0 ? "–" : `${formatDuration(minutes)} Std`);

  let dialogOpen = $state(false);
  let editing = $state<ProjectListRow | null>(null);

  function openDialog(project: ProjectListRow | null) {
    editing = project;
    dialogOpen = true;
  }

  async function toggleArchived(project: ProjectListRow) {
    try {
      await setProjectArchived(project.id, !project.archived);
      toast.success(project.archived ? "Projekt reaktiviert" : "Projekt archiviert");
      await projects.reload();
    } catch (e) {
      toast.error("Aktion fehlgeschlagen", errorMessage(e));
    }
  }

  const deletion = createDeleteFlow<ProjectListRow>({
    remove: (project) => deleteProject(project.id),
    entityLabel: "Projekt",
    describe: (project) => project.name,
    reload: projects.reload,
  });
</script>

<PageHeader title="Projekte" back={{ href: "/time", label: "Zeiten" }}>
  {#snippet actions()}
    <Button onclick={() => openDialog(null)}>
      <Plus />
      Neues Projekt
    </Button>
  {/snippet}
</PageHeader>

<div class="mb-4 flex items-center gap-2">
  <Checkbox id="projects-archived" bind:checked={f.includeArchived} />
  <Label for="projects-archived" class="text-sm">Archivierte anzeigen</Label>
</div>

<QueryBoundary query={listQuery} isEmpty={projects.data.length === 0}>
  {#snippet empty()}
    <ListEmptyState
      filtered={filters.isFiltered}
      onResetFilters={filters.reset}
      filteredMessage="Keine aktiven Projekte."
      emptyMessage="Noch keine Projekte angelegt."
      createLabel="Neues Projekt"
      onCreate={() => openDialog(null)}
    />
  {/snippet}
  <table class="data-list">
    <thead>
      <tr>
        <th>Projekt</th>
        <th class="w-full">Kunde</th>
        <th class="text-right">Stundensatz</th>
        <th class="text-right">Offen</th>
        <th class="{WIDE_ONLY} text-right">Abgerechnet</th>
        <th><span class="sr-only">Aktionen</span></th>
      </tr>
    </thead>
    <tbody>
      {#each projects.data as project (project.id)}
        {@const time = figures.data.get(project.id) ?? EMPTY_PROJECT_TIME_FIGURES}
        <tr class={project.archived ? "opacity-60" : ""}>
          <td class="whitespace-nowrap">
            <button
              type="button"
              class="text-left font-semibold hover:underline focus-visible:underline"
              title="{project.entryCount} {pluralize(project.entryCount, 'Eintrag', 'Einträge')}"
              onclick={() => openDialog(project)}
            >
              {project.name}
            </button>
            {#if project.archived}
              <Badge variant="draft" class="ml-2">archiviert</Badge>
            {/if}
          </td>
          <td class="w-full text-muted-foreground"><span class="line-clamp-1">{project.customerName}</span></td>
          <td class="text-right whitespace-nowrap tabular-nums">
            {#if project.hourlyRateCent === 0}
              <Badge variant="open" class="mr-2">kein Satz</Badge>
            {/if}
            {centsToEur(project.hourlyRateCent)}
          </td>
          <td class="text-right whitespace-nowrap tabular-nums">{hours(time.openMinutes)}</td>
          <td class="{WIDE_ONLY} text-right whitespace-nowrap tabular-nums text-muted-foreground">
            {hours(time.billedMinutes)}
          </td>
          <td class="w-12 text-right">
            <DropdownMenu>
              {#snippet trigger()}
                <MoreActionsTrigger variant="ghost" label="Aktionen" />
              {/snippet}
              <DropdownItem onSelect={() => openDialog(project)}>
                <Pencil />
                Bearbeiten
              </DropdownItem>
              <DropdownItem onSelect={() => toggleArchived(project)}>
                {#if project.archived}
                  <ArchiveRestore />
                  Reaktivieren
                {:else}
                  <Archive />
                  Archivieren
                {/if}
              </DropdownItem>
              <DropdownSeparator />
              {#if project.entryCount === 0}
                <DropdownItem destructive onSelect={() => deletion.ask(project)}>
                  <Trash2 />
                  Löschen
                </DropdownItem>
              {:else}
                <!-- Not `disabled`: Bits UI skips disabled items on the keyboard, and the reason has to be reachable. -->
                <DropdownItem
                  class="text-muted-foreground"
                  onSelect={() => toast.warning("Projekt kann nicht gelöscht werden", "Es hat Zeiteinträge. Archivieren geht immer.")}
                >
                  <Trash2 />
                  Löschen
                  <span class="ml-auto pl-3 text-xs text-muted-foreground">Hat Zeiteinträge</span>
                </DropdownItem>
              {/if}
            </DropdownMenu>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <ListSummary segments={countSummary(projects.data.length, "Projekt", "Projekte")} />
</QueryBoundary>

<ProjectDialog bind:open={dialogOpen} project={editing} onSaved={projects.reload} />

<ConfirmDialog
  bind:open={deletion.open}
  title="Projekt löschen?"
  description={deletion.target ? `„${deletion.target.name}“ hat keine Zeiteinträge und wird entfernt.` : undefined}
  confirmLabel="Löschen"
  destructive
  onConfirm={deletion.confirm}
/>
