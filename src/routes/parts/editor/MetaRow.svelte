<script lang="ts">
  import type { Snippet } from "svelte";
  import { Field } from "$lib/ui";

  type Props = {
    label: string;
    error?: string | null;
    children: Snippet;
  };
  let { label, error = null, children }: Props = $props();
</script>

<!-- One line of the meta block: a muted label and the field where the document shows the value. -->
<Field
  {label}
  {error}
  class="grid grid-cols-[1fr_10.5rem] items-center gap-x-3 gap-y-1 [&>label]:justify-end [&>label]:font-normal [&>label]:text-muted-foreground [&>p]:col-start-2"
>
  {@render children()}
</Field>
