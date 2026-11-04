<script lang="ts">
  import type { Snippet } from "svelte";
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { X } from "$lib/brand-icons";
  import { cn } from "$lib/utils";
  import { DIALOG_OVERLAY_CLASS, DIALOG_CONTENT_ANIMATION_CLASS } from "./dialog-classes";

  type Props = {
    open?: boolean;
    title?: string;
    description?: string;
    class?: string;
    children?: Snippet;
    trigger?: Snippet;
    footer?: Snippet;
    /** false blocks Escape, outside clicks and the close button, e.g. while an action is running. */
    dismissible?: boolean;
    onOpenChange?: (open: boolean) => void;
  };

  let {
    open = $bindable(false),
    title,
    description,
    class: klass,
    children,
    trigger,
    footer,
    dismissible = true,
    onOpenChange,
  }: Props = $props();
</script>

<DialogPrimitive.Root bind:open {onOpenChange}>
  {#if trigger}
    <DialogPrimitive.Trigger>
      {@render trigger()}
    </DialogPrimitive.Trigger>
  {/if}

  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class={DIALOG_OVERLAY_CLASS} />
    <DialogPrimitive.Content
      escapeKeydownBehavior={dismissible ? "close" : "ignore"}
      interactOutsideBehavior={dismissible ? "close" : "ignore"}
      class={cn(
        DIALOG_CONTENT_ANIMATION_CLASS,
        "bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg outline-none",
        klass,
      )}
    >
      {#if title || description}
        <div class="flex flex-col gap-1.5 text-left">
          {#if title}
            <DialogPrimitive.Title class="text-lg leading-none font-semibold tracking-tight">
              {title}
            </DialogPrimitive.Title>
          {/if}
          {#if description}
            <DialogPrimitive.Description class="text-muted-foreground text-sm">
              {description}
            </DialogPrimitive.Description>
          {/if}
        </div>
      {/if}

      {@render children?.()}

      {#if footer}
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {@render footer()}
        </div>
      {/if}

      {#if dismissible}
        <DialogPrimitive.Close
          class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none"
        >
          <X class="size-4" />
          <span class="sr-only">Schließen</span>
        </DialogPrimitive.Close>
      {/if}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
