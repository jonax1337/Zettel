<script lang="ts">
  import { cn } from "$lib/utils";
  import type { ProgressStep } from "./progress-steps";

  let { steps }: { steps: ProgressStep[] } = $props();
</script>

<ol aria-label="Fortschritt" class="mb-6 flex flex-wrap items-center gap-y-2 text-[13px] font-bold">
  {#each steps as step, index (step.label)}
    {#if index > 0}
      <li aria-hidden="true" class={cn("mx-2.5 h-0.5 w-11 flex-none rounded-sm", steps[index - 1].state === "done" ? "bg-foreground/70" : "bg-line-strong")}></li>
    {/if}
    <li
      aria-current={step.state === "now" ? "step" : undefined}
      class={cn(
        "inline-flex items-center gap-2",
        step.state === "now" ? "text-foreground" : step.state === "done" ? "text-foreground/80" : "text-muted-foreground/70",
      )}
    >
      <span
        class={cn(
          "size-2.5 rounded-full",
          step.state === "now" && "bg-primary ring-4 ring-primary/20",
          step.state === "done" && "bg-current",
          step.state === "todo" && "shadow-[inset_0_0_0_2px_currentColor]",
        )}
      ></span>
      {step.label}
      {#if step.date}
        <small class="font-semibold text-muted-foreground">{step.date}</small>
      {/if}
    </li>
  {/each}
</ol>
