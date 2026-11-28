<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  const OUTLINED = "border-input text-foreground hover:bg-surface-strong";

  export const buttonVariants = tv({
    base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-bold transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer",
    variants: {
      variant: {
        // The only filled variant, so a view never shows two filled buttons.
        default: "border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover",
        destructive:
          "text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40",
        outline: OUTLINED,
        secondary: OUTLINED,
        ghost: "text-foreground hover:bg-surface-strong",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 has-[>svg]:px-3",
        sm: "h-[30px] gap-1.5 rounded-[8px] px-2.5 text-[13px] has-[>svg]:px-2",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  });

  export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
  export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes, HTMLAnchorAttributes } from "svelte/elements";
  import { link } from "svelte-spa-router";
  import { cn } from "$lib/utils";

  type Props = {
    variant?: ButtonVariant;
    size?: ButtonSize;
    href?: string;
    class?: string;
    children?: Snippet;
  } & (HTMLButtonAttributes | HTMLAnchorAttributes);

  let {
    variant = "default",
    size = "default",
    href,
    class: klass,
    children,
    ...rest
  }: Props = $props();

  // Icon-only buttons have no text; their tooltip doubles as the accessible name.
  const iconOnlyLabel = $derived(
    size === "icon" ? (rest as { title?: string; "aria-label"?: string })["aria-label"] ?? (rest as { title?: string }).title : undefined,
  );
</script>

{#if href}
  <a
    {href}
    use:link
    data-variant={variant}
    class={cn(buttonVariants({ variant, size }), klass)}
    {...rest as HTMLAnchorAttributes}
  >
    {@render children?.()}
  </a>
{:else}
  <button
    data-variant={variant}
    class={cn(buttonVariants({ variant, size }), klass)}
    {...rest as HTMLButtonAttributes}
    aria-label={iconOnlyLabel ?? (rest as HTMLButtonAttributes)["aria-label"]}
  >
    {@render children?.()}
  </button>
{/if}
