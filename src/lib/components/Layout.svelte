<script lang="ts">
  import { link, router } from "svelte-spa-router";
  import active from "svelte-spa-router/active";

  let { children } = $props();

  const nav = [
    { href: "/", label: "Dashboard" },
    { href: "/customers", label: "Kunden" },
    { href: "/invoices", label: "Rechnungen" },
    { href: "/settings", label: "Einstellungen" },
  ];
</script>

<div class="flex h-full">
  <aside
    class="w-56 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-4 flex flex-col gap-1"
  >
    <h1 class="text-lg font-semibold mb-4 px-2">Zettel</h1>
    {#each nav as item}
      <a
        href={item.href}
        use:link
        use:active={{ path: item.href, className: "active-link" }}
        class="px-3 py-2 rounded text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
        class:bg-neutral-200={router.location === item.href}
        class:dark:bg-neutral-800={router.location === item.href}
      >
        {item.label}
      </a>
    {/each}
    <div class="mt-auto text-xs text-neutral-500 px-2 pt-4">
      v0.1.0 · MIT
    </div>
  </aside>

  <main class="flex-1 overflow-auto p-6">
    {@render children?.()}
  </main>
</div>

<style>
  :global(.active-link) {
    background-color: rgb(229 229 229);
  }
  @media (prefers-color-scheme: dark) {
    :global(.active-link) {
      background-color: rgb(38 38 38);
    }
  }
</style>
