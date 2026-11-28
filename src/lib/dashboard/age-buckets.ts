import { SECONDS_PER_DAY } from "$lib/utils/date";

export type AgeBucketId = "notDue" | "days1to14" | "days15to30" | "over30";

export const AGE_BUCKET_LABELS: Record<AgeBucketId, string> = {
  notDue: "Noch nicht fällig",
  days1to14: "1 bis 14 Tage überfällig",
  days15to30: "15 bis 30 Tage überfällig",
  over30: "Über 30 Tage überfällig",
};

const AGE_BUCKET_IDS = Object.keys(AGE_BUCKET_LABELS) as AgeBucketId[];

const LAST_DAY_OF_FIRST_BUCKET = 14;
const LAST_DAY_OF_SECOND_BUCKET = 30;

/**
 * An invoice is overdue once its due date is behind `now`, the same rule the
 * reminder list and the invoice list apply. The bucket follows from the whole
 * days since then.
 */
export function ageBucketOf(dueDate: number, now: number): AgeBucketId {
  if (dueDate >= now) return "notDue";
  const daysOverdue = Math.floor((now - dueDate) / SECONDS_PER_DAY);
  if (daysOverdue <= LAST_DAY_OF_FIRST_BUCKET) return "days1to14";
  if (daysOverdue <= LAST_DAY_OF_SECOND_BUCKET) return "days15to30";
  return "over30";
}

export type AgeBucket = { id: AgeBucketId; count: number; total: number };

export type OpenInvoiceRow = { dueDate: number; balance: number };

/** One entry per bucket, in order, including empty ones. */
export function bucketByAge(rows: OpenInvoiceRow[], now: number): AgeBucket[] {
  const buckets = AGE_BUCKET_IDS.map((id): AgeBucket => ({ id, count: 0, total: 0 }));
  for (const row of rows) {
    const bucket = buckets[AGE_BUCKET_IDS.indexOf(ageBucketOf(row.dueDate, now))];
    bucket.count += 1;
    bucket.total += row.balance;
  }
  return buckets;
}

export function overdueOf(buckets: AgeBucket[]): { count: number; total: number } {
  return buckets
    .filter((b) => b.id !== "notDue")
    .reduce((sum, b) => ({ count: sum.count + b.count, total: sum.total + b.total }), { count: 0, total: 0 });
}
