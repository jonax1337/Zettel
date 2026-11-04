<script lang="ts">
  import { toasts, dismiss, type Toast, type ToastVariant } from "./toast.svelte";
  import { CheckCircle2, XCircle, AlertCircle, Info, X } from "$lib/brand-icons";
  import { fly } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { cubicOut, cubicIn } from "svelte/easing";

  const variantStyles: Record<ToastVariant, { icon: typeof Info; border: string; iconColor: string }> = {
    default: { icon: Info, border: "border-border", iconColor: "text-muted-foreground" },
    success: { icon: CheckCircle2, border: "border-success/40", iconColor: "text-success" },
    error: { icon: XCircle, border: "border-destructive/40", iconColor: "text-destructive" },
    warning: { icon: AlertCircle, border: "border-warning/40", iconColor: "text-warning" },
  };

  let copiedId = $state<number | null>(null);

  async function copyDetails(t: Toast) {
    const text = t.description ? `${t.title}\n${t.description}` : t.title;
    try {
      await navigator.clipboard.writeText(text);
      copiedId = t.id;
    } catch {
      copiedId = null;
    }
  }

  async function runAction(t: Toast) {
    const action = t.action;
    if (!action) return;
    dismiss(t.id);
    await action.onClick();
  }
</script>

<div
  class="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-full max-w-sm flex-col gap-2"
>
  {#each toasts.items as t (t.id)}
    {@const style = variantStyles[t.variant]}
    {@const Icon = style.icon}
    <div
      class="pointer-events-auto bg-card flex items-start gap-3 rounded-lg border p-4 shadow-lg {style.border}"
      role={t.variant === "error" ? "alert" : "status"}
      in:fly={{ y: 24, duration: 260, easing: cubicOut }}
      out:fly={{ x: 320, duration: 220, easing: cubicIn }}
      animate:flip={{ duration: 240, easing: cubicOut }}
    >
      <Icon class="size-5 shrink-0 mt-0.5 {style.iconColor}" />
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium">{t.title}</div>
        {#if t.description}
          <div class="text-xs text-muted-foreground mt-1">{t.description}</div>
        {/if}
        {#if t.variant === "error"}
          <button
            type="button"
            onclick={() => copyDetails(t)}
            class="mt-2 mr-3 text-xs font-medium text-primary hover:underline"
          >
            {copiedId === t.id ? "Kopiert" : "Kopieren"}
          </button>
        {/if}
        {#if t.action}
          <button
            type="button"
            onclick={() => runAction(t)}
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
