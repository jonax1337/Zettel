<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { Search, Package } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import { searchCatalog } from "$lib/db/catalog";
  import type { CatalogItem } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";

  type Props = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onPick?: (item: CatalogItem) => void;
    /** "invoice" liefert defaultDatevAccount nicht — nur expense-Edit braucht es. */
    context?: "invoice" | "offer" | "recurring" | "expense";
  };
  let {
    open = $bindable(false),
    onOpenChange,
    onPick,
    context = "invoice",
  }: Props = $props();

  let query = $state("");
  let results = $state<CatalogItem[]>([]);
  let activeIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSent = "";

  $effect(() => {
    const q = query;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      lastSent = q;
      const r = await searchCatalog(q);
      if (lastSent === q) {
        results = r;
        activeIndex = 0;
      }
    }, 120);
  });

  $effect(() => {
    if (open) {
      query = "";
      results = [];
      activeIndex = 0;
      queueMicrotask(() => inputEl?.focus());
      // initial load when opening
      searchCatalog("").then((r) => {
        if (open) {
          results = r;
          activeIndex = 0;
        }
      });
    }
  });

  function commit(item: CatalogItem) {
    onPick?.(item);
    open = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length) activeIndex = (activeIndex + 1) % results.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length)
        activeIndex = (activeIndex - 1 + results.length) % results.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) commit(item);
    } else if (e.key === "Escape") {
      open = false;
    }
  }

  $effect(() => {
    if (!listEl) return;
    const row = listEl.querySelector<HTMLButtonElement>(
      `[data-idx="${activeIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  });
</script>

<DialogPrimitive.Root bind:open {onOpenChange}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <DialogPrimitive.Content
      class="bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[20%] left-[50%] z-50 grid w-full max-w-xl translate-x-[-50%] gap-0 overflow-hidden rounded-lg border bg-card shadow-2xl outline-none"
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
              class={cn(
                "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                idx === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              <Package class="size-4 shrink-0 text-muted-foreground" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium truncate">{item.name}</span>
                  {#if item.tags}
                    <span class="text-[10px] uppercase tracking-wider text-muted-foreground">{item.tags}</span>
                  {/if}
                </div>
                {#if item.descriptionDe}
                  <div class="text-xs text-muted-foreground truncate">{item.descriptionDe}</div>
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
