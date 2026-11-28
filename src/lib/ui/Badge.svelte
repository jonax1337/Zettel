<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  const TONE_CLASS = {
    draft: "text-muted-foreground shadow-[inset_0_0_0_1px_var(--line-strong)]",
    open: "bg-status-warn-bg text-status-warn",
    late: "bg-status-bad-bg text-status-bad",
    paid: "bg-status-ok-bg text-status-ok",
    calm: "bg-status-calm-bg text-status-calm",
  } as const;

  /** Tones are the vocabulary; the shadcn names below stay as aliases for existing callers. */
  export const badgeVariants = tv({
    // The dot is the tone's colour (currentColor); a badge that carries its own icon drops it.
    base: "inline-flex h-[22px] items-center justify-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-bold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none overflow-hidden before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-[''] has-[>svg]:before:hidden",
    variants: {
      variant: {
        ...TONE_CLASS,
        default: TONE_CLASS.paid,
        secondary: TONE_CLASS.draft,
        destructive: TONE_CLASS.late,
        success: TONE_CLASS.paid,
        warning: TONE_CLASS.open,
        outline: TONE_CLASS.calm,
      },
    },
    defaultVariants: { variant: "default" },
  });

  export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
  export type BadgeTone = keyof typeof TONE_CLASS;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  type Props = {
    variant?: BadgeVariant;
    class?: string;
    children?: Snippet;
  };

  let { variant = "default", class: klass, children }: Props = $props();
</script>

<span class={cn(badgeVariants({ variant }), klass)}>
  {@render children?.()}
</span>
