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
  } from "$lib/brand-icons";
  import { cn } from "$lib/utils";
  import {
    search as runSearch,
    type SearchHit,
    type SearchHitKind,
    type SearchResults,
  } from "$lib/db/search";
  import { createDebouncedTask } from "./debounced-task";
  import {
    DIALOG_CONTENT_ANIMATION_CLASS,
    DIALOG_OVERLAY_CLASS,
    pickerRowClass,
  } from "./dialog-classes";
  import { cycleIndex } from "./list-navigation";
  import { groupSearchResults, hitsInDisplayOrder } from "./search-groups";
  import { toast } from "./toast.svelte";

  type Props = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  };
  let { open = $bindable(false), onOpenChange }: Props = $props();

  const RECENTS_KEY = "zettel.search.recents";
  const MAX_RECENTS = 5;
  const SEARCH_DEBOUNCE_MS = 150;

  const HIT_ICONS: Record<SearchHitKind, typeof FileText> = {
    invoice: FileText,
    offer: FileSignature,
    reminder: FileWarning,
    expense: FileInput,
    customer: Users,
    vendor: Truck,
  };

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

  function loadRecents(): SearchHit[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENTS) : [];
    } catch {
      return [];
    }
  }

  function saveRecents(list: SearchHit[]) {
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    } catch {
      // Recents are a convenience; a blocked storage must not break navigation.
    }
  }

  let query = $state("");
  let results = $state<SearchResults>(emptyResults());
  let activeIndex = $state(0);
  let recents = $state<SearchHit[]>(loadRecents());
  let inputEl = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);

  const searchTask = createDebouncedTask({
    run: runSearch,
    onResult: (found) => {
      results = found;
      activeIndex = 0;
    },
    onError: (error) => toast.error("Suche fehlgeschlagen", String(error)),
    delayMs: SEARCH_DEBOUNCE_MS,
  });

  const hasQuery = $derived(query.trim() !== "");
  const groups = $derived(hasQuery ? groupSearchResults(results) : []);
  const visibleHits = $derived(hasQuery ? hitsInDisplayOrder(groups) : recents);
  const showingRecents = $derived(!hasQuery && recents.length > 0);

  $effect(() => {
    if (query.trim() === "") {
      searchTask.cancel();
      results = emptyResults();
      activeIndex = 0;
      return;
    }
    searchTask.schedule(query);
    return searchTask.cancel;
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

  function pushRecent(hit: SearchHit) {
    const others = recents.filter((r) => !(r.kind === hit.kind && r.id === hit.id));
    recents = [hit, ...others].slice(0, MAX_RECENTS);
    saveRecents(recents);
  }

  function selectHit(hit: SearchHit) {
    pushRecent(hit);
    open = false;
    onOpenChange?.(false);
    push(hit.route);
  }

  function moveActive(delta: number) {
    activeIndex = cycleIndex(activeIndex, delta, visibleHits.length);
    queueMicrotask(() => {
      listEl
        ?.querySelector<HTMLElement>(`[data-hit-index="${activeIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Tab") {
      e.preventDefault();
      moveActive(e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter" && visibleHits.length > 0) {
      e.preventDefault();
      selectHit(visibleHits[activeIndex]);
    }
  }

  function flatIndex(groupIdx: number, withinGroupIdx: number): number {
    let acc = 0;
    for (let i = 0; i < groupIdx; i++) acc += groups[i].hits.length;
    return acc + withinGroupIdx;
  }
</script>

{#snippet hitRow(hit: SearchHit, idx: number)}
  {@const Icon = HIT_ICONS[hit.kind]}
  <button
    type="button"
    data-hit-index={idx}
    onclick={() => selectHit(hit)}
    onmouseenter={() => (activeIndex = idx)}
    class={cn(pickerRowClass(activeIndex === idx), "text-sm")}
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
{/snippet}

<DialogPrimitive.Root bind:open {onOpenChange}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class={DIALOG_OVERLAY_CLASS} />
    <DialogPrimitive.Content
      class={cn(
        DIALOG_CONTENT_ANIMATION_CLASS,
        "bg-background fixed top-[15%] left-[50%] z-50 flex w-full max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border shadow-xl outline-none",
      )}
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
            {@render hitRow(hit, i)}
          {/each}
        {:else if !hasQuery}
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
              {@render hitRow(hit, flatIndex(gi, hi))}
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
