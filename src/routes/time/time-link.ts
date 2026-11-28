import type { TimeEntryStatusFilter } from "$lib/db/time-entries";
import { intQueryParam, queryParam } from "../invoice/route-query";

/** Filters a link to the Zeiten screen can preset; a field is absent when the link did not name a valid value. */
type TimeLinkFilters = { customerId?: string; status?: TimeEntryStatusFilter };

const STATUSES: readonly TimeEntryStatusFilter[] = ["open", "billed", "all"];

/** The customer's open (unbilled) entries, in every period. */
export function unbilledTimeHref(customerId: number): string {
  return `/time?customerId=${customerId}&status=open`;
}

/** The filters named by "?customerId=<id>&status=<open|billed|all>"; null when the link names none. */
export function timeLinkFilters(querystring: string | undefined): TimeLinkFilters | null {
  const customerId = intQueryParam(querystring, "customerId");
  const status = STATUSES.find((s) => s === queryParam(querystring, "status"));
  if (customerId === null && status === undefined) return null;
  return {
    ...(customerId === null ? {} : { customerId: String(customerId) }),
    ...(status === undefined ? {} : { status }),
  };
}
