<script lang="ts">
  import { untrack } from "svelte";
  import { Popover } from "bits-ui";
  import { Calendar, ChevronDown } from "$lib/brand-icons";
  import { Button, Select, DatePicker } from "$lib/ui";
  import { buttonVariants } from "$lib/ui/Button.svelte";
  import { type Period, type PeriodType, type Quarter, saveDefaultPeriod } from "$lib/dashboard/period";
  import { addDaysUnix, MONTHS_DE, toIsoDate } from "$lib/utils/date";
  import { periodFromSelection } from "./period-selection";
  import { cn } from "$lib/utils";

  type Props = {
    period: Period;
    onChange: (p: Period) => void;
  };
  let { period, onChange }: Props = $props();

  const YEARS_OFFERED = 6;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = (Math.floor(now.getMonth() / 3) + 1) as Quarter;

  const initialStart = untrack(() => new Date(period.start * 1000));
  let type = $state<PeriodType>(untrack(() => period.type));
  let yearStr = $state(String(initialStart.getFullYear()));
  let quarterStr = $state(String(Math.floor(initialStart.getMonth() / 3) + 1));
  let monthStr = $state(String(initialStart.getMonth() + 1));
  let customFrom = $state(untrack(() => toIsoDate(period.start)));
  let customTo = $state(untrack(() => toIsoDate(addDaysUnix(period.end, -1))));

  const typeItems: { value: PeriodType; label: string }[] = [
    { value: "year", label: "Jahr" },
    { value: "quarter", label: "Quartal" },
    { value: "month", label: "Monat" },
    { value: "custom", label: "Benutzerdefiniert" },
  ];
  const yearItems = Array.from({ length: YEARS_OFFERED }, (_, i) => {
    const year = String(currentYear - i);
    return { value: year, label: year };
  });
  const quarterItems = [
    { value: "1", label: "Q1 (Jan–Mär)" },
    { value: "2", label: "Q2 (Apr–Jun)" },
    { value: "3", label: "Q3 (Jul–Sep)" },
    { value: "4", label: "Q4 (Okt–Dez)" },
  ];
  const monthItems = MONTHS_DE.map((label, i) => ({ value: String(i + 1), label }));

  let open = $state(false);

  const triggerLabel = $derived(period.type === "year" ? `Jahr ${period.label}` : period.label);

  function emit() {
    const selected = periodFromSelection({
      type,
      year: Number.parseInt(yearStr, 10) || currentYear,
      quarter: (Number.parseInt(quarterStr, 10) || 1) as Quarter,
      month: Number.parseInt(monthStr, 10) || 1,
      customFrom,
      customTo,
    });
    if (!selected) return;
    saveDefaultPeriod(selected);
    onChange(selected);
  }

  function applyCustom() {
    emit();
    open = false;
  }

  function onTypeChange(newType: PeriodType) {
    type = newType;
    if (type === "year" && !yearStr) yearStr = String(currentYear);
    if (type === "quarter") {
      yearStr = String(currentYear);
      quarterStr = String(currentQuarter);
    }
    if (type === "month") {
      yearStr = String(currentYear);
      monthStr = String(currentMonth);
    }
    emit();
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger class={cn(buttonVariants({ variant: "outline" }), "data-[state=open]:bg-surface-strong")} aria-label="Zeitraum wählen: {triggerLabel}">
    <Calendar />
    <span class="tabular-nums">{triggerLabel}</span>
    <ChevronDown class="text-muted-foreground" />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      sideOffset={6}
      align="end"
      class={cn(
        "bg-popover text-popover-foreground z-50 flex w-72 flex-col gap-3 rounded-lg border p-4 shadow-lg",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
      )}
    >
      <Select items={typeItems} bind:value={type} onValueChange={onTypeChange} aria-label="Art des Zeitraums" />

      {#if type === "year"}
        <Select items={yearItems} bind:value={yearStr} onValueChange={() => emit()} aria-label="Jahr" />
      {:else if type === "quarter"}
        <div class="grid grid-cols-[6rem_1fr] gap-2">
          <Select items={yearItems} bind:value={yearStr} onValueChange={() => emit()} aria-label="Jahr" />
          <Select items={quarterItems} bind:value={quarterStr} onValueChange={() => emit()} aria-label="Quartal" />
        </div>
      {:else if type === "month"}
        <div class="grid grid-cols-[6rem_1fr] gap-2">
          <Select items={yearItems} bind:value={yearStr} onValueChange={() => emit()} aria-label="Jahr" />
          <Select items={monthItems} bind:value={monthStr} onValueChange={() => emit()} aria-label="Monat" />
        </div>
      {:else}
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Von</span>
          <DatePicker bind:value={customFrom} />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Bis</span>
          <DatePicker bind:value={customTo} />
        </div>
        <Button variant="outline" onclick={applyCustom}>Anwenden</Button>
      {/if}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
