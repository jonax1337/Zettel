<script lang="ts">
  import { deleteCustomer, listCustomers } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";
  import {
    Badge,
    Button,
    Card,
    Checkbox,
    Input,
    Label,
    ConfirmDialog,
    DropdownMenu,
    DropdownItem,
    DropdownSeparator,
    Select,
    toast,
  } from "$lib/ui";
  import { Plus, MoreHorizontal, Pencil, Trash2, Search } from "@lucide/svelte";
  import { push } from "svelte-spa-router";

  type CreditStatus = "good" | "caution" | "blocked";
  type StatusFilter = "all" | CreditStatus;

  let search = $state("");
  let onlyFollowUp = $state(false);
  let statusFilter = $state<StatusFilter>("all");
  let onlyProblematic = $state(false);
  let customers = $state<Customer[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const statusFilterItems: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Alle" },
    { value: "good", label: "Gut" },
    { value: "caution", label: "Vorsicht" },
    { value: "blocked", label: "Gesperrt" },
  ];

  const filtered = $derived.by(() => {
    let list = customers;
    if (onlyProblematic) {
      list = list.filter((c) => c.creditStatus === "caution" || c.creditStatus === "blocked");
    } else if (statusFilter !== "all") {
      list = list.filter((c) => c.creditStatus === statusFilter);
    }
    return list;
  });

  function statusVariant(s: CreditStatus): "success" | "warning" | "destructive" {
    if (s === "blocked") return "destructive";
    if (s === "caution") return "warning";
    return "success";
  }

  function statusLabel(s: CreditStatus): string {
    if (s === "blocked") return "Gesperrt";
    if (s === "caution") return "Vorsicht";
    return "Gut";
  }

  let confirmOpen = $state(false);
  let toDelete = $state<Customer | null>(null);

  async function reload() {
    loading = true;
    try {
      const all = await listCustomers(search);
      customers = onlyFollowUp ? all.filter((c) => c.followUpDate != null) : all;
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void search;
    void onlyFollowUp;
    reload();
  });

  function newCustomer() {
    push("/customers/new");
  }

  function editCustomer(c: Customer) {
    push(`/customers/${c.id}`);
  }

  function askDelete(c: Customer) {
    toDelete = c;
    confirmOpen = true;
  }

  async function performDelete() {
    if (!toDelete) return;
    try {
      await deleteCustomer(toDelete.id);
      toast.success("Kunde gelöscht", `"${toDelete.name}" wurde entfernt.`);
      toDelete = null;
      await reload();
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    }
  }
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Kunden</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {filtered.length} {filtered.length === 1 ? "Eintrag" : "Einträge"}
    </p>
  </div>
  <Button onclick={newCustomer}>
    <Plus />
    Neuer Kunde
  </Button>
</header>

<div class="mb-4 flex flex-wrap items-end gap-3">
  <div class="relative max-w-md flex-1 min-w-[200px]">
    <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
    <Input
      type="search"
      placeholder="Suche (Name, Nummer, Ort, E-Mail)…"
      bind:value={search}
      class="pl-9"
    />
  </div>
  <div class="flex flex-col gap-1.5 min-w-[160px]">
    <Label class="text-xs">Status</Label>
    <Select
      items={statusFilterItems}
      value={statusFilter}
      onValueChange={(v) => (statusFilter = v)}
      disabled={onlyProblematic}
    />
  </div>
  <label class="flex items-center gap-2 text-sm pb-2 cursor-pointer">
    <Checkbox bind:checked={onlyProblematic} />
    <span>Nur problematische Kunden</span>
  </label>
  <label class="flex items-center gap-2 text-sm pb-2 cursor-pointer">
    <Checkbox bind:checked={onlyFollowUp} />
    <span>Nur mit Wiedervorlage</span>
  </label>
</div>

{#if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if filtered.length === 0}
  <Card>
    <div class="py-12 text-center text-sm text-muted-foreground">
      {search || statusFilter !== "all" || onlyProblematic ? "Keine Treffer." : "Noch keine Kunden angelegt."}
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr class="text-xs uppercase tracking-wider text-muted-foreground">
          <th class="px-4 py-3 font-medium">Nr.</th>
          <th class="px-4 py-3 font-medium">Name</th>
          <th class="px-4 py-3 font-medium">Ort</th>
          <th class="px-4 py-3 font-medium">E-Mail</th>
          <th class="px-4 py-3 font-medium">Bonität</th>
          <th class="px-4 py-3 font-medium w-12"></th>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each filtered as c (c.id)}
          <tr class="border-t hover:bg-muted/30 transition-colors">
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground">{c.customerNumber}</td>
            <td class="px-4 py-3">
              <button
                type="button"
                class="text-left hover:text-foreground font-medium transition-colors"
                onclick={() => editCustomer(c)}
              >
                {c.name}
              </button>
            </td>
            <td class="px-4 py-3 text-muted-foreground">{c.city}</td>
            <td class="px-4 py-3 text-muted-foreground">{c.email ?? ""}</td>
            <td class="px-4 py-3">
              <Badge variant={statusVariant(c.creditStatus)}>{statusLabel(c.creditStatus)}</Badge>
            </td>
            <td class="px-4 py-3 text-right">
              <DropdownMenu>
                {#snippet trigger()}
                  <button
                    type="button"
                    class="inline-flex items-center justify-center size-8 rounded-md hover:bg-muted transition-colors"
                    aria-label="Aktionen"
                  >
                    <MoreHorizontal class="size-4" />
                  </button>
                {/snippet}
                <DropdownItem onSelect={() => editCustomer(c)}>
                  <Pencil />
                  Bearbeiten
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem destructive onSelect={() => askDelete(c)}>
                  <Trash2 />
                  Löschen
                </DropdownItem>
              </DropdownMenu>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
{/if}

<ConfirmDialog
  bind:open={confirmOpen}
  title="Kunde löschen?"
  description={toDelete ? `"${toDelete.name}" wird unwiderruflich entfernt.` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={performDelete}
/>
