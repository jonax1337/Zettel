<script lang="ts">
  import type { Snippet } from "svelte";
  import { Field } from "$lib/ui";

  type Props = {
    label: string;
    optional?: boolean;
    hint?: string;
    error?: string | null;
    children: Snippet;
  };
  let { label, optional = false, hint, error = null, children }: Props = $props();
</script>

<!-- A field on the sheet: the shared Field with the "(optional)" mark the printed forms use. -->
<Field label={optional ? `${label} (optional)` : label} {hint} {error}>
  {@render children()}
</Field>
