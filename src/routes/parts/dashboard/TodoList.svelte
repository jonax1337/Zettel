<script lang="ts">
  import { Button } from "$lib/ui";
  import { generateInvoiceAndOpen, generatingRecurringIds } from "../entity/recurring";
  import type { TodoItem, TodoUrgency } from "./todo";

  type Props = {
    items: TodoItem[];
    loading: boolean;
    error: string | null;
  };
  let { items, loading, error }: Props = $props();

  const VISIBLE_ROWS = 6;
  const DOT_CLASS: Record<TodoUrgency, string> = {
    late: "bg-status-bad",
    due: "bg-status-warn",
    calm: "bg-muted-foreground/50",
  };

  let expanded = $state(false);
  const visible = $derived(expanded ? items : items.slice(0, VISIBLE_ROWS));
  const hiddenCount = $derived(items.length - VISIBLE_ROWS);
</script>

<section>
  <h2 class="mb-2.5">Zu erledigen</h2>
  {#if error}
    <p class="text-sm text-destructive">Die Liste konnte nicht geladen werden: {error}</p>
  {:else if loading}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else if items.length === 0}
    <p class="border-y py-4 text-muted-foreground">Alles erledigt. Gerade gibt es nichts zu tun.</p>
  {:else}
    <ul class="border-t border-line-strong">
      {#each visible as item (item.id)}
        <li class="flex min-h-[52px] items-center gap-3 border-b px-1 py-2">
          <span class="size-2 flex-none rounded-full {DOT_CLASS[item.urgency]}" aria-hidden="true"></span>
          <div class="min-w-0">
            <div class="truncate font-bold">{item.title}</div>
            {#if item.detail}
              <div class="truncate text-[13px] text-muted-foreground tabular-nums">{item.detail}</div>
            {/if}
          </div>
          <div class="ml-auto flex-none">
            {#if item.action.kind === "generate"}
              {@const recurringId = item.action.recurringId}
              <Button
                variant="outline"
                size="sm"
                disabled={generatingRecurringIds.has(recurringId)}
                onclick={() => generateInvoiceAndOpen(recurringId)}
              >
                {item.action.label}
              </Button>
            {:else}
              <Button variant="outline" size="sm" href={item.action.href}>{item.action.label}</Button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
    {#if hiddenCount > 0}
      <Button variant="ghost" size="sm" class="mt-2" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
        {expanded ? "Weniger anzeigen" : `Alle ${items.length} anzeigen`}
      </Button>
    {/if}
  {/if}
</section>
