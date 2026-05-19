<script lang="ts">
  import { push } from "svelte-spa-router";
  import { ChevronRight } from "@lucide/svelte";
  import type { Component } from "svelte";

  interface Props {
    href: string;
    icon: Component;
    title: string;
    description: string;
    items: string[];
    tone?: "default" | "danger";
  }

  const { href, icon: Icon, title, description, items, tone = "default" }: Props = $props();

  const isDanger = $derived(tone === "danger");

  function handleClick() {
    push(href);
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      push(href);
    }
  }
</script>

<button
  type="button"
  class="group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 {isDanger
    ? 'border-destructive/40 hover:border-destructive/60'
    : 'border-border hover:border-foreground/20'}"
  onclick={handleClick}
  onkeydown={handleKey}
>
  <div class="flex items-start justify-between gap-3">
    <div
      class="flex size-10 items-center justify-center rounded-lg {isDanger
        ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-foreground'}"
    >
      <Icon class="size-5" />
    </div>
    <ChevronRight
      class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 {isDanger
        ? 'group-hover:text-destructive'
        : 'group-hover:text-foreground'}"
    />
  </div>

  <div class="space-y-1">
    <h3 class="font-semibold leading-none {isDanger ? 'text-destructive' : ''}">{title}</h3>
    <p class="text-sm text-muted-foreground">{description}</p>
  </div>

  <ul class="mt-auto flex flex-wrap gap-1.5 pt-2">
    {#each items as item (item)}
      <li
        class="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
      >
        {item}
      </li>
    {/each}
  </ul>
</button>
