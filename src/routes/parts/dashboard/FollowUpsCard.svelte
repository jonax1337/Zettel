<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Card, CardContent } from "$lib/ui";
  import { AlertTriangle, Bell } from "$lib/brand-icons";
  import type { FollowUpGroup } from "$lib/dashboard/follow-up";
  import type { FollowUpItem } from "$lib/dashboard/queries";
  import { formatDate } from "$lib/utils/date";
  import { followUpsInGroup } from "./dashboard-data";

  type Props = {
    loading: boolean;
    followUps: FollowUpItem[];
  };
  let { loading, followUps }: Props = $props();

  const GROUPS: { group: FollowUpGroup; title: string; titleClass: string; dateClass: string }[] = [
    { group: "overdue", title: "Überfällig", titleClass: "text-destructive", dateClass: "text-destructive" },
    { group: "today", title: "Heute", titleClass: "text-warning", dateClass: "text-muted-foreground" },
    { group: "week", title: "Diese Woche", titleClass: "text-muted-foreground", dateClass: "text-muted-foreground" },
  ];

  const populatedGroups = $derived(
    GROUPS.map((g) => ({ ...g, items: followUpsInGroup(followUps, g.group) })).filter(
      (g) => g.items.length > 0,
    ),
  );
</script>

<Card>
  <CardContent>
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-xs text-muted-foreground uppercase tracking-wider">Wiedervorlage</div>
        <div class="text-xs text-muted-foreground mt-0.5">heute + 7 Tage</div>
      </div>
      <Bell class="size-4 text-muted-foreground" />
    </div>
    {#if loading}
      <div class="h-32 grid place-items-center text-sm text-muted-foreground">Lade…</div>
    {:else if followUps.length === 0}
      <div class="h-32 grid place-items-center text-sm text-muted-foreground text-center">
        Keine Wiedervorlagen.
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each populatedGroups as { group, title, titleClass, dateClass, items } (group)}
          <div>
            <div class="text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1 {titleClass}">
              {#if group === "overdue"}
                <AlertTriangle class="size-3" />
              {/if}
              {title}
            </div>
            <ul class="flex flex-col gap-1">
              {#each items as item (item.kind + item.id)}
                <li>
                  <button
                    type="button"
                    onclick={() => push(item.href)}
                    class="w-full text-left text-sm hover:bg-muted/40 rounded px-2 py-1 -mx-2 cursor-pointer transition-colors flex items-baseline justify-between gap-2"
                  >
                    <span class="truncate">
                      <span class="font-medium">{item.title}</span>
                      <span class="text-muted-foreground"> · {item.subtitle}</span>
                    </span>
                    <span class="text-xs tabular-nums shrink-0 {dateClass}">{formatDate(item.followUpDate)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}
  </CardContent>
</Card>
