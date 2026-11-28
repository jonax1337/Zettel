<script lang="ts">
  import type { Snippet } from "svelte";
  import { Card } from "$lib/ui";
  import { AlertTriangle } from "$lib/brand-icons";

  type Props = {
    tone: "warning" | "destructive";
    title: string;
    children: Snippet;
  };
  let { tone, title, children }: Props = $props();

  const TONE_CLASSES = {
    warning: { card: "border-status-warn/40", text: "text-status-warn" },
    destructive: { card: "border-status-bad/40", text: "text-status-bad" },
  };
  const classes = $derived(TONE_CLASSES[tone]);
</script>

<Card class="mb-4 flex-row items-start gap-3 border px-4 py-3.5 {classes.card}">
  <AlertTriangle class="mt-0.5 size-5 shrink-0 {classes.text}" />
  <div class="min-w-0 flex-1 text-sm">
    <div class="font-bold {classes.text}">{title}</div>
    {@render children()}
  </div>
</Card>
