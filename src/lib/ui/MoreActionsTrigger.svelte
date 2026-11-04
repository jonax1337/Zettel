<script lang="ts">
  import { cn } from "$lib/utils";
  import { MoreHorizontal } from "$lib/brand-icons";

  type Props = {
    label?: string;
    /** "outline" sits next to buttons in a page header, "ghost" inside table rows. */
    variant?: "outline" | "ghost";
  };
  let { label = "Weitere Aktionen", variant = "outline" }: Props = $props();
</script>

<span
  role="img"
  aria-label={label}
  class={cn(
    "inline-flex items-center justify-center rounded-md transition-colors cursor-pointer",
    variant === "outline" ? "size-9 border border-border hover:bg-accent" : "size-8 hover:bg-muted",
  )}
>
  <MoreHorizontal class="size-4" />
</span>
