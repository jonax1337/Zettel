<script lang="ts">
  import { overdueOf, AGE_BUCKET_LABELS, type AgeBucket } from "$lib/dashboard/age-buckets";
  import type { OldestOverdue } from "$lib/dashboard/queries";
  import { centsToEur } from "$lib/utils/money";
  import AgeBar from "$lib/components/charts/AgeBar.svelte";
  import { link } from "svelte-spa-router";
  import { Card } from "$lib/ui";
  import { pluralize } from "../entity/format";
  import { OPEN_INVOICES_HREF } from "../list/invoice-tabs";

  type Props = {
    loading: boolean;
    error: string | null;
    buckets: AgeBucket[];
    /** Only its age of the oldest open invoice is used. */
    oldest: OldestOverdue;
  };
  let { loading, error, buckets, oldest }: Props = $props();

  const count = $derived(buckets.reduce((sum, b) => sum + b.count, 0));
  const total = $derived(buckets.reduce((sum, b) => sum + b.total, 0));
  const overdue = $derived(overdueOf(buckets));
  const bars = $derived(buckets.map((b) => ({ ...b, label: AGE_BUCKET_LABELS[b.id] })));
  const overdueHint = $derived(
    overdue.count === 0
      ? "alle innerhalb der Frist"
      : `davon ${overdue.count} überfällig${
          oldest.daysOverdue !== null && oldest.daysOverdue > 0
            ? `, die älteste seit ${oldest.daysOverdue} ${pluralize(oldest.daysOverdue, "Tag", "Tagen")}`
            : ""
        }`,
  );
</script>

<Card class="gap-0 p-5">
  <div class="mb-2.5 flex items-baseline gap-2.5">
    <h2>Offene Forderungen</h2>
    <a
      href={OPEN_INVOICES_HREF}
      use:link
      class="ml-auto text-[13px] font-semibold text-muted-foreground hover:text-foreground"
    >
      Alle ansehen
    </a>
  </div>
  {#if error}
    <p class="text-sm text-destructive">Konnte nicht geladen werden: {error}</p>
  {:else if loading}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else if count === 0}
    <p class="text-sm text-muted-foreground">Alles bezahlt. Es steht nichts aus.</p>
  {:else}
    <div class="font-display text-[26px] leading-[1.15] font-extrabold tracking-tight tabular-nums">
      {centsToEur(total)}
    </div>
    <div class="text-[13px] text-muted-foreground">
      {count} {pluralize(count, "Rechnung", "Rechnungen")}, {overdueHint}
    </div>
    <AgeBar buckets={bars} ariaLabel="Rechnungen nach Alter" />
  {/if}
</Card>
