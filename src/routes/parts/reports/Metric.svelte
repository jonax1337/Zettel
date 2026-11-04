<script lang="ts">
  import { cn } from "$lib/utils";

  type Props = {
    label: string;
    value: string;
    caption: string;
    valueClass?: string;
  };
  let { label, value, caption, valueClass }: Props = $props();
</script>

<div>
  <div class="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
  <div class={cn("text-2xl font-semibold tabular-nums mt-1", valueClass)}>{value}</div>
  <div class="text-xs text-muted-foreground mt-0.5">{caption}</div>
</div>
