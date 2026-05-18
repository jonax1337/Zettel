<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { push } from "svelte-spa-router";
  import {
    Search,
    FileText,
    FileSignature,
    FileInput,
    FileWarning,
    Users,
    Truck,
    History,
  } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import {
    search as runSearch,
    flattenResults,
    type SearchHit,
    type SearchResults,
    type SearchHitKind,
  } from "$lib/db/search";

  type Props = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  };
  let { open = $bindable(false), onOpenChange }: Props = $props();

  const RECENTS_KEY = "zettel.search.recents";
  const MAX_RECENTS = 5;

  let query = $state("");
  let results = $state<SearchResults>({
    invoices: [],
    customers: [],
    vendors: [],
    expenses: [],
    offers: [],
    reminders: [],
  });
  let activeIndex = $state(0);
  let recents = $state<SearchHit[]>(loadRecents());
  let inputEl = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastQuerySent = "";

  function loadRecents(): SearchHit[] {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, MAX_RECENTS);
    } catch {
      return [];
    }
  }

  function saveRecents(list: SearchHit[]) {
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  function pushRecent(hit: SearchHit) {
    const without = recents.filter(
      (r) => !(r.kind === hit.kind && r.id === hit.id),
    );
    const next = [hit, ...without].slice(0, MAX_RECENTS);
    recents = next;
    saveRecents(next);
  }

  function emptyResults(): SearchResults {
    return {
      invoices: [],
      customers: [],
      vendors: [],
      expenses: [],
      offers: [],
      reminders: [],
    };
  }

  $effect(() => {
    const q = query;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (q.trim() === "") {
      results = emptyResults();
      activeIndex = 0;
      return;
    }
    debounceTimer = setTimeout(async () => {
      lastQuerySent = q;
      const r = await runSearch(q);
      if (lastQuerySent === q) {
        results = r;
        activeIndex = 0;
      }
    }, 150);
  });

  $effect(() => {
    if (open) {
      query = "";
      results = emptyResults();
      activeIndex = 0;
      recents = loadRecents();
      queueMicrotask(() => inputEl?.focus());
    }
  });

  const visibleHits = $derived.by<SearchHit[]>(() => {
    if (query.trim() === "") return recents;
    return flattenResults(results);
  });

  const showingRecents = $derived(query.trim() === "" && recents.length > 0);

  type Group = { key: SearchHitKind; label: string; hits: SearchHit[] };

  const groups = $derived.by<Group[]>(() => {
    if (query.trim() === "") return [];
    const out: Group[] = [];
    if (results.invoices.length)
      out.push({ key: "invoice", label: "Rechnungen", hits: results.invoices });
    if (results.offers.length)
      out.push({ key: "offer", label: "Angebote", hits: results.offers });
    if (results.reminders.length)
      out.push({ key: "reminder", label: "Mahnungen", hits: results.reminders });
    if (results.expenses.length)
      out.push({ key: "expense", label: "Ausgaben", hits: results.expenses });
    if (results.customers.length)
      out.push({ key: "customer", label: "Kunden", hits: results.customers });
    if (results.vendors.length)
      out.push({ key: "vendor", label: "Lieferanten", hits: results.vendors });
    return out;
  });

  function iconFor(kind: SearchHitKind) {
    switch (kind) {
      case "invoice":
        return FileText;
      case "offer":
        return FileSignature;
      case "reminder":
        return FileWarning;
      case "expense":
        return FileInput;
      case "customer":
        return Users;
      case "vendor":
        return Truck;
    }
  }

  function selectHit(hit: SearchHit) {
    pushRecent(hit);
    open = false;
    onOpenChange?.(false);
    push(hit.route);
  }

  function onKey(e: KeyboardEvent) {
    const hits = visibleHits;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hits.length === 0) return;
      activeIndex = (activeIndex + 1) % hits.length;
      scrollActiveIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hits.length === 0) return;
      activeIndex = (activeIndex - 1 + hits.length) % hits.length;
      scrollActiveIntoView();
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (hits.length === 0) return;
      const dir = e.shiftKey ? -1 : 1;
      activeIndex = (activeIndex + dir + hits.length) % hits.length;
      scrollActiveIntoView();
    } else if (e.key === "Enter") {
      if (hits.length === 0) return;
      e.preventDefault();
      selectHit(hits[activeIndex]);
    }
  }

  function scrollActiveIntoView() {
    queueMicrotask(() => {
      const el = listEl?.querySelector<HTMLElement>(
        `[data-hit-index="${activeIndex}"]`,
      );
      el?.scrollIntoView({ block: "nearest" });
    });
  }

  function flatIndex(groupIdx: number, withinGroupIdx: number): number {
    let acc = 0;
    for (let i = 0; i < groupIdx; i++) acc += groups[i].hits.length;
    return acc + withinGroupIdx;
  }
</script>

<DialogPrimitive.Root bind:open {onOpenChange}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <DialogPrimitive.Content
      class="bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[15%] left-[50%] z-50 flex w-full max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border shadow-xl outline-none"
    >
      <DialogPrimitive.Title class="sr-only">Globale Suche</DialogPrimitive.Title>
      <DialogPrimitive.Description class="sr-only">
        Suche über Rechnungen, Kunden, Lieferanten, Ausgaben, Angebote und Mahnungen.
      </DialogPrimitive.Description>

      <div class="flex items-center gap-2 border-b px-4 py-3">
        <Search class="size-4 text-muted-foreground shrink-0" />
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={onKey}
          type="text"
          placeholder="Suchen — Rechnungen, Kunden, Lieferanten…"
          class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autocomplete="off"
          spellcheck="false"
          data-command-palette-input
        />
        <kbd class="hidden sm:inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Esc
        </kbd>
      </div>

      <div
        bind:this={listEl}
        class="max-h-[60vh] overflow-y-auto p-2"
      >
        {#if showingRecents}
          <div class="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
            <History class="size-3" />
            Zuletzt geöffnet
          </div>
          {#each recents as hit, i (hit.kind + "-" + hit.id)}
            {@const Icon = iconFor(hit.kind)}
            <button
              type="button"
              data-hit-index={i}
              onclick={() => selectHit(hit)}
              onmouseenter={() => (activeIndex = i)}
              class={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                activeIndex === i
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              <Icon class="size-4 shrink-0 text-muted-foreground" />
              <span class="font-mono text-xs text-muted-foreground shrink-0 w-24 truncate">
                {hit.number}
              </span>
              <span class="flex-1 truncate">{hit.primary}</span>
              {#if hit.secondary}
                <span class="text-xs text-muted-foreground truncate">{hit.secondary}</span>
              {/if}
            </button>
          {/each}
        {:else if query.trim() === ""}
          <div class="px-3 py-10 text-center text-sm text-muted-foreground">
            Tippen, um zu suchen…
          </div>
        {:else if groups.length === 0}
          <div class="px-3 py-10 text-center text-sm text-muted-foreground">
            Keine Treffer für „{query.trim()}".
          </div>
        {:else}
          {#each groups as group, gi (group.key)}
            <div class="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            {#each group.hits as hit, hi (hit.kind + "-" + hit.id)}
              {@const idx = flatIndex(gi, hi)}
              {@const Icon = iconFor(hit.kind)}
              <button
                type="button"
                data-hit-index={idx}
                onclick={() => selectHit(hit)}
                onmouseenter={() => (activeIndex = idx)}
                class={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  activeIndex === idx
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60",
                )}
              >
                <Icon class="size-4 shrink-0 text-muted-foreground" />
                <span class="font-mono text-xs text-muted-foreground shrink-0 w-24 truncate">
                  {hit.number}
                </span>
                <span class="flex-1 truncate">{hit.primary}</span>
                {#if hit.secondary}
                  <span class="text-xs text-muted-foreground truncate">{hit.secondary}</span>
                {/if}
              </button>
            {/each}
          {/each}
        {/if}
      </div>

      <div class="hidden sm:flex items-center justify-between border-t bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
        <div class="flex items-center gap-3">
          <span><kbd class="rounded border bg-background px-1 py-0.5">↑↓</kbd> navigieren</span>
          <span><kbd class="rounded border bg-background px-1 py-0.5">↵</kbd> öffnen</span>
        </div>
        <span><kbd class="rounded border bg-background px-1 py-0.5">Esc</kbd> schließen</span>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
