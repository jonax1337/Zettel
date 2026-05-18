<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { Minus, Square, Copy, X } from "@lucide/svelte";
  import { onMount } from "svelte";

  import type { Snippet } from "svelte";

  type Props = {
    title?: string;
    showAppMark?: boolean;
    children?: Snippet;
  };
  let { title = "Zettel", showAppMark = true, children }: Props = $props();

  const win = getCurrentWindow();
  let maximized = $state(false);

  onMount(() => {
    win.isMaximized().then((m) => (maximized = m));
    const un = win.onResized(async () => {
      maximized = await win.isMaximized();
    });
    return () => {
      un.then((u) => u());
    };
  });
</script>

<header
  data-tauri-drag-region
  class="titlebar select-none flex items-center h-9 shrink-0 bg-card border-b text-foreground"
>
  {#if showAppMark}
    <div
      data-tauri-drag-region
      class="flex items-center gap-2 pl-3 pr-4"
    >
      <div
        class="grid place-items-center size-5 rounded-[4px] bg-primary text-primary-foreground font-bold text-[10px]"
      >
        Z
      </div>
    </div>
  {:else}
    <div data-tauri-drag-region class="w-3"></div>
  {/if}

  <div
    data-tauri-drag-region
    class="flex-1 flex items-center gap-3 text-xs font-medium text-muted-foreground tracking-tight"
  >
    {title}
    {@render children?.()}
  </div>

  <div class="flex items-center h-full">
    <button
      type="button"
      class="titlebar-btn"
      aria-label="Minimieren"
      onclick={() => win.minimize()}
    >
      <Minus class="size-3.5" />
    </button>
    <button
      type="button"
      class="titlebar-btn"
      aria-label={maximized ? "Wiederherstellen" : "Maximieren"}
      onclick={() => win.toggleMaximize()}
    >
      {#if maximized}
        <Copy class="size-3 -scale-x-100" />
      {:else}
        <Square class="size-3" />
      {/if}
    </button>
    <button
      type="button"
      class="titlebar-btn titlebar-btn-close"
      aria-label="Schließen"
      onclick={() => win.close()}
    >
      <X class="size-4" />
    </button>
  </div>
</header>

<style>
  .titlebar {
    -webkit-app-region: drag;
  }
  .titlebar :global(button) {
    -webkit-app-region: no-drag;
  }
  :global(.titlebar-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 100%;
    color: var(--color-foreground);
    background: transparent;
    transition: background-color 120ms ease;
    cursor: pointer;
  }
  :global(.titlebar-btn:hover) {
    background-color: var(--color-muted);
  }
  :global(.titlebar-btn-close:hover) {
    background-color: oklch(0.577 0.245 27.325);
    color: white;
  }
</style>
