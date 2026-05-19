<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Card, CardContent, Button } from "$lib/ui";
  import { Construction, ArrowRight } from "@lucide/svelte";

  interface Props {
    issue: number;
    danger?: boolean;
  }

  const { issue, danger = false }: Props = $props();
</script>

<Card class={danger ? "border-destructive/40" : ""}>
  <CardContent class="space-y-4 py-8 text-center">
    <div
      class="mx-auto flex size-12 items-center justify-center rounded-full {danger
        ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground'}"
    >
      <Construction class="size-6" />
    </div>
    <div class="space-y-1">
      <h2 class="text-lg font-semibold">Migration in Arbeit</h2>
      <p class="text-sm text-muted-foreground">
        Diese Sektion wird in <a
          href="https://github.com/jonax1337/zettel/issues/{issue}"
          target="_blank"
          rel="noopener"
          class="underline underline-offset-2 hover:text-foreground">Issue #{issue}</a
        > aus der alten Settings-Seite hierher migriert.
      </p>
    </div>
    <div class="flex justify-center">
      <Button variant="outline" size="sm" onclick={() => push("/settings/legacy")}>
        Zur alten Einstellungs-Seite
        <ArrowRight class="size-4" />
      </Button>
    </div>
  </CardContent>
</Card>
