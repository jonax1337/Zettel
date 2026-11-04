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
    ArrowRight,
    Plus,
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
  import {
    buildPaletteCommands,
    filterCommands,
    PALETTE_GROUP_LABEL,
    type PaletteCommand,
    type PaletteCommandGroup,
  } from "./palette-commands";
  import { groupSearchResults } from "./search-groups";
  import { toast } from "./toast.svelte";

  type Props = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  };
  let { open = $bindable(false), onOpenChange }: Props = $props();

  const RECENTS_KEY = "zettel.search.recents";
  const MAX_RECENTS = 5;
  const MAX_COMMANDS_WHILE_SEARCHING = 6;
  const SEARCH_DEBOUNCE_MS = 150;

  const HIT_ICONS: Record<SearchHitKind, typeof FileText> = {
    invoice: FileText,
    offer: FileSignature,
    reminder: FileWarning,
    expense: FileInput,
    customer: Users,
    vendor: Truck,
  };

  type PaletteItem =
    | { kind: "hit"; hit: SearchHit }
    | { kind: "command"; command: PaletteCommand };
  type Section = { key: string; label: string; items: PaletteItem[] };

  const allCommands = buildPaletteCommands();
  const COMMAND_GROUPS: PaletteCommandGroup[] = ["create", "navigate"];

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
  const hitItems = (hits: SearchHit[]): PaletteItem[] => hits.map((hit) => ({ kind: "hit", hit }));

  const commandSections = $derived.by<Section[]>(() => {
    const matched = filterCommands(allCommands, query);
    const shown = hasQuery ? matched.slice(0, MAX_COMMANDS_WHILE_SEARCHING) : matched;
    return COMMAND_GROUPS.map((group) => ({
      key: group,
      label: PALETTE_GROUP_LABEL[group],
      items: shown
        .filter((c) => c.group === group)
        .map((command): PaletteItem => ({ kind: "command", command })),
    })).filter((section) => section.items.length > 0);
  });
  const hitSections = $derived<Section[]>(
    hasQuery
      ? groupSearchResults(results).map((g) => ({ key: g.key, label: g.label, items: hitItems(g.hits) }))
      : [],
  );
  const recentSections = $derived<Section[]>(
    !hasQuery && recents.length > 0
      ? [{ key: "recents", label: "Zuletzt geöffnet", items: hitItems(recents) }]
      : [],
  );
  const sections = $derived([...recentSections, ...commandSections, ...hitSections]);
  const visibleItems = $derived(sections.flatMap((s) => s.items));

  $effect(() => {
    activeIndex = 0;
    if (query.trim() === "") {
      searchTask.cancel();
      results = emptyResults();
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

  function closeAndGo(route: string) {
    open = false;
    onOpenChange?.(false);
    push(route);
  }

  function selectItem(item: PaletteItem) {
    if (item.kind === "hit") {
      pushRecent(item.hit);
      closeAndGo(item.hit.route);
    } else {
      closeAndGo(item.command.route);
    }
  }

  function moveActive(delta: number) {
    activeIndex = cycleIndex(activeIndex, delta, visibleItems.length);
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
    } else if (e.key === "Enter" && visibleItems.length > 0) {
      e.preventDefault();
      selectItem(visibleItems[activeIndex]);
    }
  }

  function flatIndex(sectionIdx: number, withinSectionIdx: number): number {
    let acc = 0;
    for (let i = 0; i < sectionIdx; i++) acc += sections[i].items.length;
    return acc + withinSectionIdx;
  }
</script>

{#snippet itemRow(item: PaletteItem, idx: number)}
  <button
    type="button"
    data-hit-index={idx}
    onclick={() => selectItem(item)}
    onmouseenter={() => (activeIndex = idx)}
    class={cn(pickerRowClass(activeIndex === idx), "text-sm")}
  >
    {#if item.kind === "hit"}
      {@const Icon = HIT_ICONS[item.hit.kind]}
      <Icon class="size-4 shrink-0 text-muted-foreground" />
      <span class="font-mono text-xs text-muted-foreground shrink-0 w-24 truncate">
        {item.hit.number}
      </span>
      <span class="flex-1 truncate">{item.hit.primary}</span>
      {#if item.hit.secondary}
        <span class="text-xs text-muted-foreground truncate">{item.hit.secondary}</span>
      {/if}
    {:else}
      {#if item.command.group === "create"}
        <Plus class="size-4 shrink-0 text-muted-foreground" />
      {:else}
        <ArrowRight class="size-4 shrink-0 text-muted-foreground" />
      {/if}
      <span class="flex-1 truncate">{item.command.label}</span>
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
          placeholder="Suchen oder Aktion wählen — Rechnungen, Kunden, „Neue Rechnung“…"
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
        {#if sections.length === 0}
          <div class="px-3 py-10 text-center text-sm text-muted-foreground">
            Keine Treffer für „{query.trim()}".
          </div>
        {:else}
          {#each sections as section, si (section.key)}
            <div class="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
              {#if section.key === "recents"}
                <History class="size-3" />
              {/if}
              {section.label}
            </div>
            {#each section.items as item, ii (section.key + "-" + (item.kind === "hit" ? item.hit.kind + item.hit.id : item.command.id))}
              {@render itemRow(item, flatIndex(si, ii))}
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
