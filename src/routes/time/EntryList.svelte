<script lang="ts">
  import { link } from "svelte-spa-router";
  import type { TimeEntryListRow } from "$lib/db/time-entries";
  import { formatDuration } from "$lib/time/duration";
  import { Badge, Card, Checkbox } from "$lib/ui";
  import RowActionsMenu from "../parts/entity/RowActionsMenu.svelte";
  import type { DayGroup } from "./day-groups";
  import { timeRangeText } from "./entry-form";
  import { isBillable } from "./selection";

  type Props = {
    groups: DayGroup<TimeEntryListRow>[];
    isSelected: (id: number) => boolean;
    onToggle: (id: number) => void;
    onEdit: (entry: TimeEntryListRow) => void;
    onDelete: (entry: TimeEntryListRow) => void;
  };
  let { groups, isSelected, onToggle, onEdit, onDelete }: Props = $props();
</script>

<Card class="overflow-hidden py-0">
  <table class="w-full text-sm">
    <tbody>
      {#each groups as group (group.entryDate)}
        <tr class="bg-muted/40 {group === groups[0] ? '' : 'border-t'}">
          <th scope="colgroup" colspan="6" class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </th>
          <td class="px-4 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {formatDuration(group.finishedMinutes)}
          </td>
        </tr>
        {#each group.entries as entry (entry.id)}
          <tr class="border-t hover:bg-muted/30 transition-colors">
            <td class="w-10 px-4 py-3">
              {#if isBillable(entry)}
                <Checkbox
                  checked={isSelected(entry.id)}
                  onCheckedChange={() => onToggle(entry.id)}
                  aria-label="Eintrag {entry.projectName} auswählen"
                />
              {/if}
            </td>
            <td class="px-3 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{timeRangeText(entry) ?? "—"}</td>
            <td class="px-3 py-3 min-w-32">
              <div class="line-clamp-1 font-medium" title="{entry.customerName} · {entry.projectName}">{entry.projectName}</div>
              <div class="text-xs text-muted-foreground line-clamp-1">{entry.customerName}</div>
            </td>
            <td class="px-3 py-3 text-muted-foreground"><span class="line-clamp-2">{entry.description}</span></td>
            <td class="px-3 py-3 text-right font-mono whitespace-nowrap">
              {entry.durationMinutes === null ? "läuft" : formatDuration(entry.durationMinutes)}
            </td>
            <td class="px-3 py-3 whitespace-nowrap">
              {#if entry.invoiceId !== null}
                <a
                  href="/invoices/{entry.invoiceId}"
                  use:link
                  class="inline-flex"
                  title="Rechnung {entry.invoiceNumber ?? ''} öffnen"
                >
                  <Badge variant="success">abgerechnet · {entry.invoiceNumber}</Badge>
                </a>
                {#if entry.invoiceReversed}
                  <Badge variant="warning" class="ml-1">Rechnung storniert</Badge>
                {/if}
              {:else if entry.durationMinutes === null}
                <Badge variant="warning">läuft</Badge>
              {:else}
                <Badge variant="outline">offen</Badge>
              {/if}
            </td>
            <td class="w-12 px-4 py-3 text-right">
              {#if isBillable(entry)}
                <RowActionsMenu onEdit={() => onEdit(entry)} onDelete={() => onDelete(entry)} />
              {/if}
            </td>
          </tr>
        {/each}
      {/each}
    </tbody>
  </table>
</Card>
