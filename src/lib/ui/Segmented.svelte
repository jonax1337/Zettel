<script lang="ts">
  import { cn } from "$lib/utils";

  type Props = {
    value: string;
    items: { value: string; label: string }[];
    ariaLabel: string;
  };

  let { value = $bindable(), items, ariaLabel }: Props = $props();
</script>

<div role="group" aria-label={ariaLabel} class="inline-flex gap-0.5 rounded-md bg-muted p-[3px]">
  {#each items as item (item.value)}
    {@const pressed = item.value === value}
    <button
      type="button"
      aria-pressed={pressed}
      onclick={() => (value = item.value)}
      class={cn(
        "h-[30px] rounded-[7px] px-3 text-[13px] font-bold transition-colors",
        pressed
          ? "bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/12%)]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {item.label}
    </button>
  {/each}
</div>
