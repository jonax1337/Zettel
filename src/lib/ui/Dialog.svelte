<script lang="ts">
  import type { Snippet } from "svelte";
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { X } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  type Props = {
    open?: boolean;
    title?: string;
    description?: string;
    class?: string;
    children?: Snippet;
    trigger?: Snippet;
    footer?: Snippet;
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
    <DialogPrimitive.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <DialogPrimitive.Content
      class={cn(
        "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg outline-none",
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

      <DialogPrimitive.Close
        class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none"
      >
        <X class="size-4" />
        <span class="sr-only">Schließen</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
