<script lang="ts">
  import { deleteProject, listProjects, setProjectArchived, type ProjectListRow } from "$lib/db/projects";
  import { centsToEur } from "$lib/utils/money";
  import {
    Badge,
    Button,
    Card,
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
  import BackLink from "./parts/entity/BackLink.svelte";
  import { createDeleteFlow } from "./parts/entity/delete-flow.svelte";
  import { createListFilters } from "./parts/entity/list-filters.svelte";
  import ListEmptyState from "./parts/entity/ListEmptyState.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import { pluralize } from "./parts/entity/format";
  import ProjectDialog from "./time/ProjectDialog.svelte";

  const filters = createListFilters<{ includeArchived: boolean }>("time-projects", { includeArchived: false });
  const f = filters.values;

  const projects = createQueryState<ProjectListRow[]>([], () => listProjects({ includeArchived: f.includeArchived }));
  $effect(() => {
    projects.reload();
  });

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
      toast.error("Aktion fehlgeschlagen", String(e));
    }
  }

  const deletion = createDeleteFlow<ProjectListRow>({
    remove: (project) => deleteProject(project.id),
    entityLabel: "Projekt",
    describe: (project) => project.name,
    reload: projects.reload,
  });
</script>

<PageHeader
  title="Projekte"
  subtitle="{projects.data.length} {pluralize(projects.data.length, 'Projekt', 'Projekte')}"
>
  {#snippet back()}
    <BackLink href="/time">Zeiterfassung</BackLink>
  {/snippet}
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

<QueryBoundary query={projects} isEmpty={projects.data.length === 0}>
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
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr class="text-xs uppercase tracking-wider text-muted-foreground">
          <th class="px-4 py-3 font-medium min-w-32">Projekt</th>
          <th class="px-4 py-3 font-medium min-w-32">Kunde</th>
          <th class="px-4 py-3 font-medium text-right whitespace-nowrap">Stundensatz</th>
          <th class="hidden @3xl:table-cell px-4 py-3 font-medium text-right whitespace-nowrap">Einträge</th>
          <th class="px-4 py-3 font-medium w-12"></th>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each projects.data as project (project.id)}
          <tr class="border-t hover:bg-muted/30 transition-colors {project.archived ? 'opacity-60' : ''}">
            <td class="px-4 py-3">
              <button
                type="button"
                class="text-left font-medium hover:text-foreground transition-colors"
                onclick={() => openDialog(project)}
              >
                {project.name}
              </button>
              {#if project.archived}
                <Badge variant="secondary" class="ml-2 text-[10px]">archiviert</Badge>
              {/if}
            </td>
            <td class="px-4 py-3 text-muted-foreground">{project.customerName}</td>
            <td class="px-4 py-3 text-right font-mono whitespace-nowrap">
              {centsToEur(project.hourlyRateCent)}
              {#if project.hourlyRateCent === 0}
                <Badge variant="warning" class="ml-1 text-[10px]">kein Satz</Badge>
              {/if}
            </td>
            <td class="hidden @3xl:table-cell px-4 py-3 text-right tabular-nums text-muted-foreground">{project.entryCount}</td>
            <td class="px-4 py-3 text-right">
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
                {#if project.entryCount === 0}
                  <DropdownSeparator />
                  <DropdownItem destructive onSelect={() => deletion.ask(project)}>
                    <Trash2 />
                    Löschen
                  </DropdownItem>
                {/if}
              </DropdownMenu>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
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
