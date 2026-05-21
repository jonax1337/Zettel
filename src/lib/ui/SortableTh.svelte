<script lang="ts" generics="K extends string">
  import { ArrowUp, ArrowDown, ArrowUpDown } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  type Direction = "asc" | "desc" | null;

  type Props = {
    /** Spaltenschlüssel — identifiziert die Sortierung. */
    column: K;
    /** Aktueller Sort-Key der Tabelle. */
    activeKey: K | null;
    /** Aktuelle Richtung der Tabelle. */
    activeDir: Direction;
    /** Callback wenn der Header geklickt wird. */
    onChange: (column: K, dir: Direction) => void;
    /** Optional: rechtsbündig (z. B. für Beträge). */
    align?: "left" | "right";
    /** Klassen für das umschließende <th>. */
    class?: string;
    children?: import("svelte").Snippet;
  };

  let {
    column,
    activeKey,
    activeDir,
    onChange,
    align = "left",
    class: klass,
    children,
  }: Props = $props();

  const isActive = $derived(activeKey === column);

  function nextDir(current: Direction): Direction {
    if (current === null) return "asc";
    if (current === "asc") return "desc";
    return null;
  }

  function onClick() {
    if (!isActive) {
      onChange(column, "asc");
    } else {
      onChange(column, nextDir(activeDir));
    }
  }
</script>

<th class={cn("font-medium select-none", klass)}>
  <button
    type="button"
    onclick={onClick}
    class={cn(
      "group inline-flex items-center gap-1 text-xs uppercase tracking-wider transition-colors",
      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      align === "right" && "flex-row-reverse",
    )}
  >
    <span>{@render children?.()}</span>
    {#if isActive && activeDir === "asc"}
      <ArrowUp class="size-3" />
    {:else if isActive && activeDir === "desc"}
      <ArrowDown class="size-3" />
    {:else}
      <ArrowUpDown class="size-3 opacity-40 group-hover:opacity-70" />
    {/if}
  </button>
</th>
