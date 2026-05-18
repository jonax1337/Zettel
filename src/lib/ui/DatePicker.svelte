<script lang="ts">
  import { DatePicker } from "bits-ui";
  import { CalendarDate, type DateValue } from "@internationalized/date";
  import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  type Props = {
    /** ISO date (YYYY-MM-DD) or empty string. */
    value?: string;
    id?: string;
    disabled?: boolean;
    required?: boolean;
    class?: string;
    minValue?: string;
    maxValue?: string;
  };

  let {
    value = $bindable(""),
    id,
    disabled = false,
    required = false,
    class: klass,
    minValue,
    maxValue,
  }: Props = $props();

  function parseIso(iso: string): DateValue | undefined {
    if (!iso) return undefined;
    const [y, m, d] = iso.split("-").map((n) => Number.parseInt(n, 10));
    if (!y || !m || !d) return undefined;
    return new CalendarDate(y, m, d);
  }

  function toIso(dv: DateValue | undefined): string {
    if (!dv) return "";
    return `${String(dv.year).padStart(4, "0")}-${String(dv.month).padStart(2, "0")}-${String(dv.day).padStart(2, "0")}`;
  }

  let dateValue = $derived(parseIso(value));
  function handleChange(v: DateValue | undefined) {
    value = toIso(v);
  }

  const minDV = $derived(minValue ? parseIso(minValue) : undefined);
  const maxDV = $derived(maxValue ? parseIso(maxValue) : undefined);

  // Placeholder controls which month the calendar currently displays.
  // Bound on Root so we can jump months/years from the custom header.
  const today = new Date();
  let placeholder = $state<DateValue>(
    new CalendarDate(today.getFullYear(), today.getMonth() + 1, 1),
  );
  $effect(() => {
    if (dateValue) placeholder = dateValue;
  });

  type View = "days" | "months" | "years";
  let view = $state<View>("days");

  const MONTHS_DE = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];
  const MONTHS_DE_SHORT = [
    "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
  ];

  function selectMonth(m: number) {
    placeholder = new CalendarDate(placeholder.year, m, 1);
    view = "days";
  }
  function selectYear(y: number) {
    placeholder = new CalendarDate(y, placeholder.month, 1);
    view = "months";
  }
  function yearRange(center: number): number[] {
    const start = Math.floor(center / 12) * 12;
    return Array.from({ length: 12 }, (_, i) => start + i);
  }
  function shiftYears(delta: number) {
    placeholder = new CalendarDate(placeholder.year + delta, placeholder.month, 1);
  }
</script>

<DatePicker.Root
  value={dateValue}
  onValueChange={handleChange}
  bind:placeholder
  weekStartsOn={1}
  locale="de-DE"
  weekdayFormat="short"
  granularity="day"
  required={required || undefined}
  disabled={disabled || undefined}
  minValue={minDV}
  maxValue={maxDV}
  onOpenChange={(o) => { if (!o) view = "days"; }}
>
  <DatePicker.Input
    {id}
    class={cn(
      "flex h-9 w-full items-center gap-0.5 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors",
      "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
      "data-[invalid]:border-destructive data-[invalid]:ring-destructive/30",
      "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      "dark:bg-input/30",
      klass,
    )}
  >
    {#snippet children({ segments })}
      {#each segments as { part, value: segValue }, i (part + i)}
        {#if part === "literal"}
          <DatePicker.Segment {part} class="text-muted-foreground select-none">
            {segValue}
          </DatePicker.Segment>
        {:else}
          <DatePicker.Segment
            {part}
            class={cn(
              "rounded px-0.5 tabular-nums outline-none transition-colors",
              "focus:bg-primary focus:text-primary-foreground",
              "data-[placeholder]:text-muted-foreground",
              "aria-[valuetext=Empty]:text-muted-foreground",
            )}
          >
            {segValue}
          </DatePicker.Segment>
        {/if}
      {/each}
      <DatePicker.Trigger
        class={cn(
          "ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors cursor-pointer",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        aria-label="Kalender öffnen"
      >
        <CalendarIcon class="size-4" />
      </DatePicker.Trigger>
    {/snippet}
  </DatePicker.Input>

  <DatePicker.Content sideOffset={6} class="z-50">
    <DatePicker.Calendar
      class="rounded-lg border bg-popover text-popover-foreground shadow-md p-3 select-none w-[268px]"
    >
      {#snippet children({ months, weekdays })}
        <!-- Custom header: month + year are clickable to switch views -->
        <div class="flex items-center justify-between mb-2">
          {#if view === "days"}
            <DatePicker.PrevButton
              class="inline-flex items-center justify-center size-7 rounded-md hover:bg-accent transition-colors cursor-pointer"
              aria-label="Vorheriger Monat"
            >
              <ChevronLeft class="size-4" />
            </DatePicker.PrevButton>
            <div class="flex items-center gap-1">
              <button
                type="button"
                onclick={() => (view = "months")}
                class="px-2 h-7 rounded-md text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
              >
                {MONTHS_DE[placeholder.month - 1]}
              </button>
              <button
                type="button"
                onclick={() => (view = "years")}
                class="px-2 h-7 rounded-md text-sm font-medium hover:bg-accent transition-colors cursor-pointer tabular-nums"
              >
                {placeholder.year}
              </button>
            </div>
            <DatePicker.NextButton
              class="inline-flex items-center justify-center size-7 rounded-md hover:bg-accent transition-colors cursor-pointer"
              aria-label="Nächster Monat"
            >
              <ChevronRight class="size-4" />
            </DatePicker.NextButton>
          {:else if view === "months"}
            <button
              type="button"
              onclick={() => shiftYears(-1)}
              class="inline-flex items-center justify-center size-7 rounded-md hover:bg-accent transition-colors cursor-pointer"
              aria-label="Vorheriges Jahr"
            >
              <ChevronLeft class="size-4" />
            </button>
            <button
              type="button"
              onclick={() => (view = "years")}
              class="px-2 h-7 rounded-md text-sm font-medium hover:bg-accent transition-colors cursor-pointer tabular-nums"
            >
              {placeholder.year}
            </button>
            <button
              type="button"
              onclick={() => shiftYears(1)}
              class="inline-flex items-center justify-center size-7 rounded-md hover:bg-accent transition-colors cursor-pointer"
              aria-label="Nächstes Jahr"
            >
              <ChevronRight class="size-4" />
            </button>
          {:else}
            <button
              type="button"
              onclick={() => shiftYears(-12)}
              class="inline-flex items-center justify-center size-7 rounded-md hover:bg-accent transition-colors cursor-pointer"
              aria-label="Vorherige 12 Jahre"
            >
              <ChevronLeft class="size-4" />
            </button>
            {@const years = yearRange(placeholder.year)}
            <span class="text-sm font-medium tabular-nums">
              {years[0]} – {years[11]}
            </span>
            <button
              type="button"
              onclick={() => shiftYears(12)}
              class="inline-flex items-center justify-center size-7 rounded-md hover:bg-accent transition-colors cursor-pointer"
              aria-label="Nächste 12 Jahre"
            >
              <ChevronRight class="size-4" />
            </button>
          {/if}
        </div>

        {#if view === "days"}
          {#each months as month (month.value.toString())}
            <DatePicker.Grid class="w-full border-collapse">
              <DatePicker.GridHead>
                <DatePicker.GridRow class="flex">
                  {#each weekdays as weekday (weekday)}
                    <DatePicker.HeadCell class="w-9 h-8 text-[11px] font-normal text-muted-foreground flex items-center justify-center">
                      {weekday.slice(0, 2)}
                    </DatePicker.HeadCell>
                  {/each}
                </DatePicker.GridRow>
              </DatePicker.GridHead>
              <DatePicker.GridBody>
                {#each month.weeks as weekDates, wi (wi)}
                  <DatePicker.GridRow class="flex w-full mt-1">
                    {#each weekDates as date (date.toString())}
                      <DatePicker.Cell {date} month={month.value} class="relative p-0 text-center text-sm">
                        <DatePicker.Day
                          class={cn(
                            "size-9 inline-flex items-center justify-center rounded-md text-sm font-normal cursor-pointer transition-colors tabular-nums",
                            "hover:bg-accent",
                            "data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:font-medium",
                            "data-[outside-month]:text-muted-foreground/40 data-[outside-month]:pointer-events-none",
                            "data-[unavailable]:text-muted-foreground/40 data-[unavailable]:line-through data-[unavailable]:pointer-events-none",
                            "data-[disabled]:opacity-40 data-[disabled]:pointer-events-none",
                            "data-[today]:font-semibold data-[today]:ring-1 data-[today]:ring-primary/40",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          )}
                        />
                      </DatePicker.Cell>
                    {/each}
                  </DatePicker.GridRow>
                {/each}
              </DatePicker.GridBody>
            </DatePicker.Grid>
          {/each}
        {:else if view === "months"}
          <div class="grid grid-cols-3 gap-1.5 mt-1">
            {#each MONTHS_DE_SHORT as label, idx (idx)}
              {@const m = idx + 1}
              {@const isCurrent = placeholder.month === m && (!dateValue || dateValue.month === m)}
              {@const isSelected = !!dateValue && dateValue.year === placeholder.year && dateValue.month === m}
              <button
                type="button"
                onclick={() => selectMonth(m)}
                class={cn(
                  "h-10 rounded-md text-sm font-normal hover:bg-accent transition-colors cursor-pointer",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary font-medium",
                  !isSelected && isCurrent && "ring-1 ring-primary/40 font-medium",
                )}
              >
                {label}
              </button>
            {/each}
          </div>
        {:else}
          {@const years = yearRange(placeholder.year)}
          {@const currentYear = new Date().getFullYear()}
          <div class="grid grid-cols-3 gap-1.5 mt-1">
            {#each years as y (y)}
              {@const isSelected = !!dateValue && dateValue.year === y}
              {@const isCurrent = currentYear === y}
              <button
                type="button"
                onclick={() => selectYear(y)}
                class={cn(
                  "h-10 rounded-md text-sm font-normal hover:bg-accent transition-colors cursor-pointer tabular-nums",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary font-medium",
                  !isSelected && isCurrent && "ring-1 ring-primary/40 font-medium",
                )}
              >
                {y}
              </button>
            {/each}
          </div>
        {/if}
      {/snippet}
    </DatePicker.Calendar>
  </DatePicker.Content>
</DatePicker.Root>
