<script lang="ts">
  import { Popover } from "bits-ui";
  import { CalendarRange, X } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import DatePicker from "./DatePicker.svelte";
  import { fromIsoDate, formatDate } from "$lib/utils/date";

  type Props = {
    /** ISO YYYY-MM-DD or empty string. Empty start+end = no period set. */
    startIso?: string;
    endIso?: string;
    disabled?: boolean;
    class?: string;
  };

  let {
    startIso = $bindable(""),
    endIso = $bindable(""),
    disabled = false,
    class: klass,
  }: Props = $props();

  const hasValue = $derived(!!startIso && !!endIso);
  const isSingleDay = $derived(hasValue && startIso === endIso);

  let open = $state(false);
  let mode = $state<"single" | "range">("single");

  $effect(() => {
    if (open) {
      mode = isSingleDay || !hasValue ? "single" : "range";
    }
  });

  let invalid = $derived(
    mode === "range" &&
      !!startIso &&
      !!endIso &&
      fromIsoDate(endIso) < fromIsoDate(startIso),
  );

  function switchToSingle() {
    mode = "single";
    if (startIso) endIso = startIso;
  }
  function switchToRange() {
    mode = "range";
    if (!endIso && startIso) endIso = startIso;
  }

  function clear() {
    startIso = "";
    endIso = "";
    open = false;
  }

  function chipLabel(s: string, e: string): string {
    if (!s || !e) return "";
    const sd = fromIsoDate(s);
    const ed = fromIsoDate(e);
    if (sd === ed) return formatDate(sd);
    return `${formatDate(sd)} – ${formatDate(ed)}`;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    {disabled}
    class={cn(
      "inline-flex items-center gap-1.5 rounded-md border border-input bg-transparent px-2 h-7 text-xs",
      "text-muted-foreground transition-colors cursor-pointer",
      "hover:bg-accent hover:text-foreground",
      "data-[state=open]:bg-accent data-[state=open]:text-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "disabled:cursor-not-allowed disabled:opacity-50",
      hasValue && "border-primary/40 text-foreground bg-primary/5",
      klass,
    )}
    aria-label={hasValue
      ? `Leistungszeitraum: ${chipLabel(startIso, endIso)} — bearbeiten`
      : "Leistungsdatum hinzufügen"}
  >
    <CalendarRange class="size-3.5 shrink-0" />
    {#if hasValue}
      <span class="tabular-nums">{chipLabel(startIso, endIso)}</span>
    {:else}
      <span>Leistungsdatum</span>
    {/if}
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      sideOffset={6}
      align="start"
      class={cn(
        "bg-popover text-popover-foreground z-50 rounded-lg border p-3 shadow-md w-[300px]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
      )}
    >
      <div class="inline-flex w-full rounded-md bg-muted/50 p-0.5 mb-3">
        <button
          type="button"
          onclick={switchToSingle}
          class={cn(
            "flex-1 h-7 rounded-sm text-xs font-medium transition-colors cursor-pointer",
            mode === "single"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Einzeltag
        </button>
        <button
          type="button"
          onclick={switchToRange}
          class={cn(
            "flex-1 h-7 rounded-sm text-xs font-medium transition-colors cursor-pointer",
            mode === "range"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Zeitraum
        </button>
      </div>

      {#if mode === "single"}
        <DatePicker
          bind:value={
            () => startIso,
            (v: string) => {
              startIso = v;
              endIso = v;
            }
          }
        />
        <p class="text-[11px] text-muted-foreground mt-1.5">
          Tag der Leistungserbringung (BT-134).
        </p>
      {:else}
        <div class="grid grid-cols-2 gap-1.5">
          <div class="flex flex-col gap-1">
            <span class="text-[11px] text-muted-foreground">Von</span>
            <DatePicker bind:value={startIso} />
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-[11px] text-muted-foreground">Bis</span>
            <DatePicker bind:value={endIso} minValue={startIso || undefined} />
          </div>
        </div>
        {#if invalid}
          <p class="text-[11px] text-destructive mt-1.5">
            Enddatum liegt vor Startdatum.
          </p>
        {:else}
          <p class="text-[11px] text-muted-foreground mt-1.5">
            Zeitraum der Leistungserbringung (BT-134/135).
          </p>
        {/if}
      {/if}

      <div class="flex items-center justify-between mt-3 pt-3 border-t">
        {#if hasValue}
          <button
            type="button"
            onclick={clear}
            class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          >
            <X class="size-3" /> Entfernen
          </button>
        {:else}
          <span></span>
        {/if}
        <button
          type="button"
          onclick={() => (open = false)}
          class="text-xs h-7 px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Fertig
        </button>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
