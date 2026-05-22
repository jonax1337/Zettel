<script lang="ts">
  import { untrack } from "svelte";
  import { Select, DatePicker } from "$lib/ui";
  import {
    type Period,
    type PeriodType,
    periodForYear,
    periodForQuarter,
    periodForMonth,
    periodCustom,
    saveDefaultPeriod,
  } from "$lib/dashboard/period";
  import { toIsoDate, fromIsoDate } from "$lib/utils/date";

  type Props = {
    period: Period;
    onChange: (p: Period) => void;
  };
  let { period, onChange }: Props = $props();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;

  const initialStart = untrack(() => new Date(period.start * 1000));
  let type = $state<PeriodType>(untrack(() => period.type));
  let yearStr = $state(String(initialStart.getFullYear()));
  let quarterStr = $state(String(Math.floor(initialStart.getMonth() / 3) + 1));
  let monthStr = $state(String(initialStart.getMonth() + 1));
  let customFrom = $state(untrack(() => toIsoDate(period.start)));
  let customTo = $state(untrack(() => toIsoDate(period.end - 86400)));

  const typeItems = [
    { value: "year", label: "Jahr" },
    { value: "quarter", label: "Quartal" },
    { value: "month", label: "Monat" },
    { value: "custom", label: "Benutzerdefiniert" },
  ];

  const yearItems = $derived(
    Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => ({
      value: String(y),
      label: String(y),
    })),
  );
  const quarterItems = [
    { value: "1", label: "Q1 (Jan–Mär)" },
    { value: "2", label: "Q2 (Apr–Jun)" },
    { value: "3", label: "Q3 (Jul–Sep)" },
    { value: "4", label: "Q4 (Okt–Dez)" },
  ];
  const monthItems = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ].map((label, i) => ({ value: String(i + 1), label }));

  function emit() {
    const y = Number.parseInt(yearStr, 10) || currentYear;
    let p: Period;
    if (type === "year") {
      p = periodForYear(y);
    } else if (type === "quarter") {
      p = periodForQuarter(y, (Number.parseInt(quarterStr, 10) || 1) as 1 | 2 | 3 | 4);
    } else if (type === "month") {
      p = periodForMonth(y, Number.parseInt(monthStr, 10) || 1);
    } else {
      if (!customFrom || !customTo) return;
      const s = fromIsoDate(customFrom);
      const e = fromIsoDate(customTo) + 86400;
      if (e <= s) return;
      p = periodCustom(s, e);
    }
    saveDefaultPeriod(p);
    onChange(p);
  }

  function onTypeChange(v: string) {
    type = v as PeriodType;
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

<div class="flex flex-wrap items-end gap-2">
  <div class="w-44">
    <Select items={typeItems} bind:value={type} onValueChange={onTypeChange} />
  </div>

  {#if type === "year"}
    <div class="w-28">
      <Select items={yearItems} bind:value={yearStr} onValueChange={() => emit()} />
    </div>
  {:else if type === "quarter"}
    <div class="w-28">
      <Select items={yearItems} bind:value={yearStr} onValueChange={() => emit()} />
    </div>
    <div class="w-40">
      <Select items={quarterItems} bind:value={quarterStr} onValueChange={() => emit()} />
    </div>
  {:else if type === "month"}
    <div class="w-28">
      <Select items={yearItems} bind:value={yearStr} onValueChange={() => emit()} />
    </div>
    <div class="w-40">
      <Select items={monthItems} bind:value={monthStr} onValueChange={() => emit()} />
    </div>
  {:else}
    <div class="w-40">
      <DatePicker bind:value={customFrom} />
    </div>
    <span class="text-sm text-muted-foreground pb-2">–</span>
    <div class="w-40">
      <DatePicker bind:value={customTo} />
    </div>
    <button
      type="button"
      onclick={emit}
      class="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors cursor-pointer"
    >
      Anwenden
    </button>
  {/if}
</div>
