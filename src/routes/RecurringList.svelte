<script lang="ts">
  import { link } from "svelte-spa-router";
  import {
    listRecurring,
    deleteRecurring,
    toggleActive,
    type RecurringListRow,
  } from "$lib/db/recurring";
  import { formatDate, nowUnix } from "$lib/utils/date";
  import { applySort } from "$lib/utils/sort";
  import { Button, Badge, Card, ConfirmDialog, SortableTh, toast, EmptyState } from "$lib/ui";
  import { Plus, FileText, Pencil, Trash2, PowerOff, Power } from "$lib/brand-icons";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import {
    RECURRING_INTERVAL_LABEL,
    generateInvoiceAndOpen,
    generatingRecurringIds,
  } from "./parts/entity/recurring";

  const templates = createQueryState<RecurringListRow[]>([], listRecurring);
  $effect(() => {
    templates.reload();
  });

  type SortKey = "name" | "customer" | "interval" | "nextDueDate" | "active";
  const sort = createListSort<SortKey>("recurring", { key: "nextDueDate", dir: "asc" });
  const sortedTemplates = $derived(
    applySort(templates.data, sort.state, {
      name: (r) => r.name,
      customer: (r) => r.customerName,
      interval: (r) => r.interval,
      nextDueDate: (r) => r.nextDueDate,
      active: (r) => (r.active ? 1 : 0),
    }),
  );

  let confirmOpen = $state(false);
  let confirmDeleteId = $state<number | null>(null);

  function isDue(row: RecurringListRow): boolean {
    return row.nextDueDate <= nowUnix();
  }

  async function onToggle(row: RecurringListRow) {
    try {
      await toggleActive(row.id, !row.active);
      await templates.reload();
    } catch (e) {
      toast.error("Fehler", String(e));
    }
  }

  function askDelete(id: number) {
    confirmDeleteId = id;
    confirmOpen = true;
  }

  async function onConfirmDelete() {
    if (confirmDeleteId === null) return;
    try {
      await deleteRecurring(confirmDeleteId);
      toast.success("Vorlage gelöscht");
      await templates.reload();
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    } finally {
      confirmDeleteId = null;
    }
  }
</script>

<header class="mb-6 flex items-end justify-between gap-3">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Wiederkehrende Rechnungen</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Vorlagen für Retainer- oder Abo-Modelle. Erzeugung erfolgt manuell pro Fälligkeit.
    </p>
  </div>
  <a href="/recurring/new" use:link>
    <Button>
      <Plus class="size-4" />
      Neue Vorlage
    </Button>
  </a>
</header>

{#if templates.error}
  <p class="text-sm text-destructive">Fehler: {templates.error}</p>
{:else if templates.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if templates.data.length === 0}
  <EmptyState message="Noch keine Vorlagen. Erstelle die erste über „Neue Vorlage“." />
{:else}
  <Card class="overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr>
          <SortableTh column="name" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 py-2 min-w-32">Name</SortableTh>
          <SortableTh column="customer" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-3 py-2 min-w-32">Kunde</SortableTh>
          <SortableTh column="interval" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-3 py-2 whitespace-nowrap">Intervall</SortableTh>
          <SortableTh column="nextDueDate" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 py-2 whitespace-nowrap">Nächste Fälligkeit</SortableTh>
          <SortableTh column="active" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 py-2 whitespace-nowrap">Status</SortableTh>
          <th class="px-3 py-2 font-medium text-right w-px text-xs uppercase tracking-wider text-muted-foreground">Aktionen</th>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each sortedTemplates as row (row.id)}
          <tr class="border-t">
            <td class="px-3 py-2 min-w-32">
              <a href={`/recurring/${row.id}`} use:link class="font-medium hover:underline" title={row.name}>
                <span class="line-clamp-2">{row.name}</span>
              </a>
            </td>
            <td class="hidden @3xl:table-cell px-3 py-2 text-muted-foreground min-w-32"><span class="line-clamp-2" title={row.customerName}>{row.customerName}</span></td>
            <td class="hidden @3xl:table-cell px-3 py-2 whitespace-nowrap">{RECURRING_INTERVAL_LABEL[row.interval]}</td>
            <td class="px-3 py-2 whitespace-nowrap">
              <span class={isDue(row) && row.active ? "text-warning font-medium" : ""}>
                {formatDate(row.nextDueDate)}
              </span>
              {#if row.lastGeneratedAt}
                <div class="text-xs text-muted-foreground">
                  zuletzt: {formatDate(row.lastGeneratedAt)}
                </div>
              {/if}
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              {#if row.active}
                <Badge variant="default">Aktiv</Badge>
              {:else}
                <Badge variant="secondary">Pausiert</Badge>
              {/if}
            </td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <div class="inline-flex items-center gap-1">
                {#if row.active && isDue(row)}
                  <Button
                    size="sm"
                    disabled={generatingRecurringIds.has(row.id)}
                    onclick={() => generateInvoiceAndOpen(row.id)}
                  >
                    <FileText class="size-3.5" />
                    Jetzt erzeugen
                  </Button>
                {/if}
                <Button size="icon" variant="ghost" onclick={() => onToggle(row)} aria-label={row.active ? "Pausieren" : "Aktivieren"}>
                  {#if row.active}
                    <PowerOff class="size-4" />
                  {:else}
                    <Power class="size-4" />
                  {/if}
                </Button>
                <a href={`/recurring/${row.id}`} use:link>
                  <Button size="icon" variant="ghost" aria-label="Bearbeiten">
                    <Pencil class="size-4" />
                  </Button>
                </a>
                <Button size="icon" variant="ghost" onclick={() => askDelete(row.id)} aria-label="Löschen">
                  <Trash2 class="size-4" />
                </Button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
{/if}

<ConfirmDialog
  bind:open={confirmOpen}
  title="Vorlage löschen?"
  description="Die Vorlage wird unwiderruflich entfernt. Bereits erzeugte Rechnungen bleiben bestehen."
  confirmLabel="Löschen"
  destructive
  onConfirm={onConfirmDelete}
/>
