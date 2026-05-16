<script lang="ts">
  import { toasts, dismiss } from "./toast.svelte";
  import { CheckCircle2, XCircle, AlertCircle, Info, X } from "@lucide/svelte";

  const icons = {
    default: Info,
    success: CheckCircle2,
    error: XCircle,
    warning: AlertCircle,
  };

  const accents = {
    default: "border-border",
    success: "border-success/40",
    error: "border-destructive/40",
    warning: "border-warning/40",
  };

  const iconColors = {
    default: "text-muted-foreground",
    success: "text-success",
    error: "text-destructive",
    warning: "text-warning",
  };
</script>

<div
  class="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-full max-w-sm flex-col gap-2"
>
  {#each toasts.items as t (t.id)}
    {@const Icon = icons[t.variant]}
    <div
      class="pointer-events-auto bg-card flex items-start gap-3 rounded-lg border p-4 shadow-lg {accents[
        t.variant
      ]}"
      role="status"
    >
      <Icon class="size-5 shrink-0 mt-0.5 {iconColors[t.variant]}" />
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium">{t.title}</div>
        {#if t.description}
          <div class="text-xs text-muted-foreground mt-1">{t.description}</div>
        {/if}
        {#if t.action}
          <button
            type="button"
            onclick={async () => {
              const action = t.action!;
              dismiss(t.id);
              await action.onClick();
            }}
            class="mt-2 text-xs font-medium text-primary hover:underline"
          >
            {t.action.label}
          </button>
        {/if}
      </div>
      <button
        type="button"
        onclick={() => dismiss(t.id)}
        class="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Schließen"
      >
        <X class="size-4" />
      </button>
    </div>
  {/each}
</div>
