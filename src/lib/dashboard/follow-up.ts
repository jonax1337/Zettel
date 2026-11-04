import { addDaysUnix, startOfDayUnix } from "$lib/utils/date";

export type FollowUpGroup = "overdue" | "today" | "week";

export type FollowUpWindow = {
  todayStart: number;
  tomorrowStart: number;
  /** Exclusive: follow-ups from today through the next seven days are shown. */
  horizonEnd: number;
};

const HORIZON_DAYS = 8;

export function followUpWindow(now: Date): FollowUpWindow {
  const todayStart = startOfDayUnix(now);
  return {
    todayStart,
    tomorrowStart: addDaysUnix(todayStart, 1),
    horizonEnd: addDaysUnix(todayStart, HORIZON_DAYS),
  };
}

export function classifyFollowUp(followUpDate: number, window: FollowUpWindow): FollowUpGroup {
  if (followUpDate < window.todayStart) return "overdue";
  if (followUpDate < window.tomorrowStart) return "today";
  return "week";
}
