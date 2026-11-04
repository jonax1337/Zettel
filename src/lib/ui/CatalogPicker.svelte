<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { Search, Package } from "$lib/brand-icons";
  import { cn } from "$lib/utils";
  import { searchCatalog } from "$lib/db/catalog";
  import type { CatalogItem } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { createDebouncedTask } from "./debounced-task";
  import {
    DIALOG_CONTENT_ANIMATION_CLASS,
    DIALOG_OVERLAY_CLASS,
    pickerRowClass,
  } from "./dialog-classes";
  import { cycleIndex } from "./list-navigation";
  import { toast } from "./toast.svelte";

  type Props = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onPick?: (item: CatalogItem) => void;
    /** Sprache der aktiven Rechnung/Angebot — entscheidet welche Beschreibung der Picker zeigt. */
    language?: "de" | "en";
  };
  let {
    open = $bindable(false),
    onOpenChange,
    onPick,
    language = "de",
  }: Props = $props();

  const SEARCH_DEBOUNCE_MS = 120;

  let query = $state("");
  let results = $state<CatalogItem[]>([]);
  let activeIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);

  const searchTask = createDebouncedTask({
    run: searchCatalog,
    onResult: (items) => {
      results = items;
      activeIndex = 0;
    },
    onError: (error) => toast.error("Katalog-Suche fehlgeschlagen", String(error)),
    delayMs: SEARCH_DEBOUNCE_MS,
  });

  $effect(() => {
    if (!open) {
      searchTask.cancel();
      return;
    }
    query = "";
    results = [];
    activeIndex = 0;
    queueMicrotask(() => inputEl?.focus());
    searchTask.runNow("");
  });

  $effect(() => {
    listEl
      ?.querySelector<HTMLButtonElement>(`[data-idx="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });

  function descriptionFor(item: CatalogItem): string {
    if (language === "en" && item.descriptionEn) return item.descriptionEn;
    return item.descriptionDe ?? "";
  }

  function commit(item: CatalogItem) {
    onPick?.(item);
    open = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = cycleIndex(activeIndex, 1, results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = cycleIndex(activeIndex, -1, results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) commit(item);
    } else if (e.key === "Escape") {
      open = false;
    }
  }
</script>

<DialogPrimitive.Root bind:open {onOpenChange}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class={DIALOG_OVERLAY_CLASS} />
    <DialogPrimitive.Content
      class={cn(
        DIALOG_CONTENT_ANIMATION_CLASS,
        "bg-background fixed top-[20%] left-[50%] z-50 grid w-full max-w-xl translate-x-[-50%] gap-0 overflow-hidden rounded-lg border bg-card shadow-2xl outline-none",
      )}
    >
      <DialogPrimitive.Title class="sr-only">Aus Katalog einfügen</DialogPrimitive.Title>
      <DialogPrimitive.Description class="sr-only">
        Wähle eine wiederverwendbare Position aus dem Artikel-Katalog.
      </DialogPrimitive.Description>

      <div class="flex items-center gap-2 border-b px-3 py-2">
        <Search class="size-4 text-muted-foreground" />
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={() => searchTask.schedule(query)}
          onkeydown={onKey}
          placeholder="Katalog durchsuchen…"
          class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          data-command-palette-input
        />
        <kbd class="hidden md:inline rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          ↵ einfügen
        </kbd>
      </div>

      <div bind:this={listEl} class="max-h-[50vh] overflow-y-auto p-1">
        {#if results.length === 0}
          <div class="py-12 text-center text-sm text-muted-foreground">
            {query.trim() === ""
              ? "Noch keine Katalog-Einträge. Lege welche unter Stammdaten → Katalog an."
              : "Kein Treffer."}
          </div>
        {:else}
          {#each results as item, idx (item.id)}
            <button
              type="button"
              data-idx={idx}
              onclick={() => commit(item)}
              onmouseenter={() => (activeIndex = idx)}
              class={pickerRowClass(idx === activeIndex)}
            >
              <Package class="size-4 shrink-0 text-muted-foreground" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium truncate">{item.name}</span>
                  {#if item.tags}
                    <span class="text-[10px] uppercase tracking-wider text-muted-foreground">{item.tags}</span>
                  {/if}
                </div>
                {#if descriptionFor(item)}
                  <div class="text-xs text-muted-foreground truncate">{descriptionFor(item)}</div>
                {/if}
              </div>
              <div class="text-right text-xs tabular-nums shrink-0">
                <div class="font-medium">{centsToEur(item.defaultUnitPrice)} € / {item.unit}</div>
                <div class="text-muted-foreground">{item.defaultVatRate} % USt</div>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
