<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Card, CardContent } from "$lib/ui";
  import { CheckCircle2, ArrowRight } from "$lib/brand-icons";
  import type { SetupStep } from "$lib/dashboard/setup-checklist";

  type Props = { steps: SetupStep[] };
  let { steps }: Props = $props();
</script>

<Card class="mb-6">
  <CardContent>
    <h2 class="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-3">
      Erste Schritte
    </h2>
    <ol class="flex flex-col gap-2">
      {#each steps as step (step.id)}
        <li class="flex items-center gap-3 text-sm">
          {#if step.done}
            <CheckCircle2 class="size-4 text-success shrink-0" aria-label="Erledigt" />
            <span class="text-muted-foreground line-through">{step.label}</span>
          {:else}
            <span class="size-4 shrink-0 rounded-full border border-muted-foreground/40" aria-hidden="true"></span>
            <a href={step.href} use:link class="group inline-flex items-center gap-1 font-medium hover:underline">
              {step.label}
              <ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </a>
          {/if}
        </li>
      {/each}
    </ol>
  </CardContent>
</Card>
