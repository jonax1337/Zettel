<script lang="ts">
  import { Button, Card } from "$lib/ui";
  import { FileText, Repeat } from "$lib/brand-icons";
  import type { RecurringListRow } from "$lib/db/recurring";
  import { formatDate } from "$lib/utils/date";
  import { generateInvoiceAndOpen, generatingRecurringIds } from "../entity/recurring";

  type Props = { templates: RecurringListRow[] };
  let { templates }: Props = $props();
</script>

<section class="mb-6">
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-sm font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
      <Repeat class="size-4" />
      Fällige wiederkehrende Rechnungen
    </h2>
    <span class="text-xs text-muted-foreground">{templates.length} fällig</span>
  </div>
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <tbody class="stagger">
        {#each templates as template (template.id)}
          <tr class="border-t first:border-t-0">
            <td class="px-4 py-3 font-medium">{template.name}</td>
            <td class="px-4 py-3 text-muted-foreground">{template.customerName}</td>
            <td class="px-4 py-3 text-warning tabular-nums">
              fällig {formatDate(template.nextDueDate)}
            </td>
            <td class="px-4 py-3 text-right">
              <Button
                size="sm"
                disabled={generatingRecurringIds.has(template.id)}
                onclick={() => generateInvoiceAndOpen(template.id)}
              >
                <FileText class="size-3.5" />
                Jetzt erzeugen
              </Button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
</section>
