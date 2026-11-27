<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Badge } from "$lib/ui";
  import { levelLabel } from "$lib/db/reminders";
  import type { Reminder, ReminderLevel } from "$lib/db/schema";
  import { formatDate } from "$lib/utils/date";
  import DetailPanel from "./detail/DetailPanel.svelte";

  let { reminders }: { reminders: Reminder[] } = $props();
</script>

<DetailPanel title="Mahnungen">
  <ul class="grid gap-1">
    {#each reminders as r (r.id)}
      <li>
        <a
          href={`/reminders/${r.id}`}
          use:link
          class="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-surface-strong"
        >
          <span class="font-bold">{levelLabel(r.level as ReminderLevel)}</span>
          <span class="text-xs text-muted-foreground tabular-nums">{formatDate(r.issueDate)}</span>
          <Badge variant={r.status === "sent" ? "open" : "draft"} class="ml-auto">
            {r.status === "sent" ? "versendet" : "Entwurf"}
          </Badge>
        </a>
      </li>
    {/each}
  </ul>
</DetailPanel>
