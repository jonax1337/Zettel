<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { onMount } from "svelte";
  import {
    listRecurring,
    deleteRecurring,
    toggleActive,
    generateInvoiceFromRecurring,
    type RecurringListRow,
  } from "$lib/db/recurring";
  import { formatDate as fmtDate } from "$lib/utils/date";
  import { Button, Badge, Card, ConfirmDialog, SortableTh, toast } from "$lib/ui";
  import { Plus, FileText, Pencil, Trash2, PowerOff, Power } from "@lucide/svelte";
  import { applySort, loadSortState, saveSortState, type SortState } from "$lib/utils/sort";

  let rows = $state<RecurringListRow[]>([]);
  let loading = $state(true);
  let confirmDeleteId = $state<number | null>(null);
  let confirmOpen = $state(false);

  const intervalLabels: Record<RecurringListRow["interval"], string> = {
    monthly: "Monatlich",
    quarterly: "Quartalsweise",
    yearly: "Jährlich",
  };

  async function refresh() {
    loading = true;
    try {
      rows = await listRecurring();
    } finally {
      loading = false;
    }
  }

  onMount(refresh);

  function isDue(unixSeconds: number): boolean {
    return unixSeconds * 1000 <= Date.now();
  }

  async function onGenerate(id: number) {
    try {
      const invoiceId = await generateInvoiceFromRecurring(id);
      toast.success("Rechnung erzeugt");
      push(`/invoices/${invoiceId}`);
    } catch (e) {
      toast.error("Erzeugen fehlgeschlagen", String(e));
    }
  }

  async function onToggle(row: RecurringListRow) {
    try {
      await toggleActive(row.id, !row.active);
      await refresh();
    } catch (e) {
      toast.error("Fehler", String(e));
    }
  }

  function askDelete(id: number) {
    confirmDeleteId = id;
    confirmOpen = true;
  }

  type SortKey = "name" | "customer" | "interval" | "nextDueDate" | "active";
  let sort = $state<SortState<SortKey>>(loadSortState<SortKey>("recurring", { key: "nextDueDate", dir: "asc" }));
  function setSort(key: SortKey, dir: SortState<SortKey>["dir"]) {
    sort = { key: dir === null ? null : key, dir };
    saveSortState("recurring", sort);
  }
  const sortedRows = $derived(
    applySort(rows, sort, {
      name: (r) => r.name,
      customer: (r) => r.customerName,
      interval: (r) => r.interval,
      nextDueDate: (r) => r.nextDueDate,
      active: (r) => (r.active ? 1 : 0),
    }),
  );

  async function onConfirmDelete() {
    if (confirmDeleteId === null) return;
    try {
      await deleteRecurring(confirmDeleteId);
      toast.success("Vorlage gelöscht");
      await refresh();
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

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if rows.length === 0}
  <Card class="p-12 text-center">
    <p class="text-sm text-muted-foreground">
      Noch keine Vorlagen. Erstelle die erste über „Neue Vorlage".
    </p>
  </Card>
{:else}
  <Card class="overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr>
          <SortableTh column="name" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-3 py-2">Name</SortableTh>
          <SortableTh column="customer" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-3 py-2">Kunde</SortableTh>
          <SortableTh column="interval" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-3 py-2">Intervall</SortableTh>
          <SortableTh column="nextDueDate" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-3 py-2">Nächste Fälligkeit</SortableTh>
          <SortableTh column="active" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-3 py-2">Status</SortableTh>
          <th class="px-3 py-2 font-medium text-right w-px text-xs uppercase tracking-wider text-muted-foreground">Aktionen</th>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each sortedRows as row (row.id)}
          <tr class="border-t">
            <td class="px-3 py-2">
              <a href={`/recurring/${row.id}`} use:link class="font-medium hover:underline">
                {row.name}
              </a>
            </td>
            <td class="px-3 py-2 text-muted-foreground">{row.customerName}</td>
            <td class="px-3 py-2">{intervalLabels[row.interval]}</td>
            <td class="px-3 py-2">
              <span class={isDue(row.nextDueDate) && row.active ? "text-amber-600 dark:text-amber-500 font-medium" : ""}>
                {fmtDate(row.nextDueDate)}
              </span>
              {#if row.lastGeneratedAt}
                <div class="text-xs text-muted-foreground">
                  zuletzt: {fmtDate(row.lastGeneratedAt)}
                </div>
              {/if}
            </td>
            <td class="px-3 py-2">
              {#if row.active}
                <Badge variant="default">Aktiv</Badge>
              {:else}
                <Badge variant="secondary">Pausiert</Badge>
              {/if}
            </td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <div class="inline-flex items-center gap-1">
                {#if row.active && isDue(row.nextDueDate)}
                  <Button size="sm" onclick={() => onGenerate(row.id)}>
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
