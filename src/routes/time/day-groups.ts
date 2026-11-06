type GroupableEntry = { entryDate: number; durationMinutes: number | null };

export type DayGroup<T extends GroupableEntry> = {
  entryDate: number;
  label: string;
  /** Minutes of finished entries; a running timer has no duration yet. */
  finishedMinutes: number;
  entries: T[];
};

const dayLabelFormat = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Groups consecutive rows by work day, keeping the order the rows came in. */
export function groupByDay<T extends GroupableEntry>(rows: T[]): DayGroup<T>[] {
  const groups = new Map<number, DayGroup<T>>();
  for (const row of rows) {
    let group = groups.get(row.entryDate);
    if (!group) {
      group = {
        entryDate: row.entryDate,
        label: dayLabelFormat.format(new Date(row.entryDate * 1000)),
        finishedMinutes: 0,
        entries: [],
      };
      groups.set(row.entryDate, group);
    }
    group.entries.push(row);
    group.finishedMinutes += row.durationMinutes ?? 0;
  }
  return [...groups.values()];
}
