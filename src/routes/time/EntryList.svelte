<script lang="ts">
  import { link } from "svelte-spa-router";
  import type { TimeEntryListRow } from "$lib/db/time-entries";
  import { formatDuration } from "$lib/time/duration";
  import { Badge, Checkbox, StatusBadge } from "$lib/ui";
  import { WIDE_ONLY } from "../invoice/list-support";
  import RowActionsMenu from "../parts/entity/RowActionsMenu.svelte";
  import type { DayGroup } from "./day-groups";
  import { timeRangeText } from "./entry-form";
  import { ENTRY_STATUS, entryStatus } from "./entry-status";
  import { isBillable } from "./selection";

  type Props = {
    groups: DayGroup<TimeEntryListRow>[];
    isSelected: (id: number) => boolean;
    onToggle: (id: number) => void;
    onEdit: (entry: TimeEntryListRow) => void;
    onDelete: (entry: TimeEntryListRow) => void;
  };
  let { groups, isSelected, onToggle, onEdit, onDelete }: Props = $props();

  const DAY_CELL = "h-auto bg-transparent pt-5 pb-2 text-sm border-line-strong";
  // Customer and description share the free width; below the wide breakpoint the description column is hidden.
  const CUSTOMER_CELL = "whitespace-nowrap text-muted-foreground max-[1180px]:w-full max-[1180px]:max-w-0 max-[1180px]:truncate";
</script>

<table class="data-list">
  <tbody>
    {#each groups as group (group.entryDate)}
      <tr>
        <th scope="rowgroup" colspan="4" class="{DAY_CELL} text-left font-display font-extrabold text-foreground">{group.label}</th>
        <td class="{DAY_CELL} {WIDE_ONLY}"></td>
        <td class={DAY_CELL}></td>
        <td class="{DAY_CELL} text-right font-bold text-muted-foreground tabular-nums whitespace-nowrap">
          {formatDuration(group.finishedMinutes)}
        </td>
        <td class={DAY_CELL}></td>
      </tr>
      {#each group.entries as entry (entry.id)}
        {@const status = entryStatus(entry)}
        <tr>
          <td class="w-10">
            {#if isBillable(entry)}
              <Checkbox
                checked={isSelected(entry.id)}
                onCheckedChange={() => onToggle(entry.id)}
                aria-label="Eintrag {entry.projectName} auswählen"
              />
            {/if}
          </td>
          <td class="text-muted-foreground tabular-nums whitespace-nowrap">{timeRangeText(entry) ?? "—"}</td>
          <td class="font-semibold whitespace-nowrap">
            <!-- The description column is hidden on narrow windows; the tooltip carries it there. -->
            <span title={entry.description || undefined}>{entry.projectName}</span>
          </td>
          <td class={CUSTOMER_CELL} title={entry.customerName}>{entry.customerName}</td>
          <td class="{WIDE_ONLY} w-full text-muted-foreground"><span class="line-clamp-2">{entry.description}</span></td>
          <td class="whitespace-nowrap">
            <div class="inline-flex items-center gap-2">
              <StatusBadge {status} table={ENTRY_STATUS} />
              {#if entry.invoiceId !== null}
                <a
                  href="/invoices/{entry.invoiceId}"
                  use:link
                  class="text-[13px] text-muted-foreground tabular-nums hover:text-foreground hover:underline"
                  title="Rechnung {entry.invoiceNumber ?? ''} öffnen"
                >
                  {entry.invoiceNumber}
                </a>
                {#if entry.invoiceReversed}
                  <Badge variant="late">Rechnung storniert</Badge>
                {/if}
              {/if}
            </div>
          </td>
          <td class="text-right font-bold tabular-nums whitespace-nowrap">
            {entry.durationMinutes === null ? "läuft" : formatDuration(entry.durationMinutes)}
          </td>
          <td class="w-12 text-right">
            {#if isBillable(entry)}
              <RowActionsMenu onEdit={() => onEdit(entry)} onDelete={() => onDelete(entry)} />
            {/if}
          </td>
        </tr>
      {/each}
    {/each}
  </tbody>
</table>
