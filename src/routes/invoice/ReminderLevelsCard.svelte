<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Badge, Card, CardContent } from "$lib/ui";
  import { FileWarning } from "$lib/brand-icons";
  import { levelLabel } from "$lib/db/reminders";
  import type { Reminder, ReminderLevel } from "$lib/db/schema";
  import { formatDate } from "$lib/utils/date";

  type Props = {
    reminders: Reminder[];
    /** Level of the next reminder to create, or null when none can be created. */
    nextLevel: ReminderLevel | null;
    onCreateNext: () => void;
  };
  let { reminders, nextLevel, onCreateNext }: Props = $props();
</script>

<Card class="mb-6">
  <CardContent>
    <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">Mahnstufen</h3>
    <div class="flex flex-wrap gap-2">
      {#each reminders as r (r.id)}
        <a
          href={`/reminders/${r.id}`}
          use:link
          class="group inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent/60 transition-colors"
        >
          <span class="inline-flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary text-xs font-semibold tabular-nums">
            M{r.level}
          </span>
          <span class="font-medium">{levelLabel(r.level as ReminderLevel)}</span>
          <span class="text-xs text-muted-foreground">{formatDate(r.issueDate)}</span>
          <Badge variant={r.status === "sent" ? "warning" : "secondary"} class="text-[10px]">
            {r.status === "sent" ? "versendet" : "Entwurf"}
          </Badge>
        </a>
      {/each}
      {#if nextLevel}
        <button
          type="button"
          onclick={onCreateNext}
          class="group inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
        >
          <FileWarning class="size-3.5" />
          <span>Nächste Stufe: {levelLabel(nextLevel)}</span>
        </button>
      {/if}
    </div>
  </CardContent>
</Card>
