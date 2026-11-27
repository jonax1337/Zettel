<script lang="ts">
  import { link } from "svelte-spa-router";
  import { centsToEur } from "$lib/utils/money";
  import { pluralize } from "../entity/format";

  type OfferStats = { count: number; total: number; unconvertedCount: number; expiringSoonCount: number };
  type Props = { customerCount: number; offerStats: OfferStats };
  let { customerCount, offerStats }: Props = $props();

  const CELL = "flex-1 py-3.5 pr-5 not-first:border-l not-first:pl-5 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-ring group";
</script>

<nav aria-label="Kunden und Angebote" class="flex border-y border-t-input">
  <a href="/customers" use:link class={CELL}>
    <span class="text-[13px] text-muted-foreground group-hover:text-foreground">Kunden</span>
    <b class="mt-0.5 block font-display text-[22px] leading-tight font-extrabold tabular-nums">{customerCount}</b>
  </a>
  <a href="/offers" use:link class={CELL}>
    <span class="text-[13px] text-muted-foreground group-hover:text-foreground">Offene Angebote</span>
    <b class="mt-0.5 block font-display text-[22px] leading-tight font-extrabold tabular-nums">{centsToEur(offerStats.total)}</b>
    <span class="text-xs text-muted-foreground">
      {offerStats.count} {pluralize(offerStats.count, "Angebot", "Angebote")}
      {#if offerStats.expiringSoonCount > 0}
        <span class="text-warning"> · {offerStats.expiringSoonCount} {pluralize(offerStats.expiringSoonCount, "läuft", "laufen")} bald ab</span>
      {/if}
      {#if offerStats.unconvertedCount > 0}
        <span class="text-warning"> · {offerStats.unconvertedCount} ohne Wechselkurs nicht in der Summe</span>
      {/if}
    </span>
  </a>
</nav>
