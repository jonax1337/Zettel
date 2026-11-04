<script lang="ts">
  import type { Snippet } from "svelte";
  import { Card, CardContent } from "$lib/ui";
  import { AlertTriangle } from "$lib/brand-icons";

  type Props = {
    tone: "warning" | "destructive";
    title: string;
    children: Snippet;
  };
  let { tone, title, children }: Props = $props();

  const TONE_CLASSES = {
    warning: { card: "border-warning/40 bg-warning/10", text: "text-warning" },
    destructive: { card: "border-destructive/40 bg-destructive/5", text: "text-destructive" },
  };
  const classes = $derived(TONE_CLASSES[tone]);
</script>

<Card class="{classes.card} mb-4">
  <CardContent>
    <div class="flex items-start gap-3">
      <AlertTriangle class="size-5 {classes.text} shrink-0 mt-0.5" />
      <div class="flex-1 text-sm">
        <div class="font-medium {classes.text}">{title}</div>
        {@render children()}
      </div>
    </div>
  </CardContent>
</Card>
