<script lang="ts">
  import { Input, Field } from "$lib/ui";
  import { formatInvoiceNumber } from "$lib/utils/invoice-number";
  import type { SequenceProblems } from "./numbering-form";

  type Props = {
    title: string;
    format: string;
    counter: number | null;
    problems: SequenceProblems;
  };
  let { title, format = $bindable(), counter = $bindable(), problems }: Props = $props();

  const next = $derived(formatInvoiceNumber(format, (counter ?? 0) + 1));
</script>

<Field label="{title}: Format" hint="Nächste Nummer: {next}" error={problems.format}>
  <Input bind:value={format} required aria-invalid={problems.format ? true : undefined} />
</Field>
<Field label="{title}: aktueller Zähler" error={problems.counter}>
  <Input
    type="number"
    min="0"
    step="1"
    required
    bind:value={counter}
    aria-invalid={problems.counter ? true : undefined}
  />
</Field>
