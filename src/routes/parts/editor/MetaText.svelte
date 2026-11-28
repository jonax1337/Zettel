<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    label: string;
    /** The value is a real one (e.g. a number already assigned), not a note about what happens later. */
    assigned?: boolean;
    children: Snippet;
  };
  let { label, assigned = false, children }: Props = $props();
</script>

<!-- A line of the meta block that shows a value instead of a field, e.g. the number that is assigned later. -->
<div class="flex items-start justify-end gap-3">
  <span class="pt-px text-muted-foreground">{label}</span>
  <span
    class="w-[10.5rem] text-left text-sm leading-snug {assigned ? 'font-semibold' : 'text-muted-foreground'}"
  >
    {@render children()}
  </span>
</div>
