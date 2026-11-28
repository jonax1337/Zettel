import type { InvoiceListRow } from "$lib/db/invoices";
import { canRecordPayments, isOverdue } from "../../invoice/invoice-actions";
import { queryParam } from "../../invoice/route-query";

export type InvoiceTab = "all" | "open" | "reminders" | "recurring";

export const INVOICES_HREF = "/invoices";
export const OPEN_INVOICES_HREF = "/invoices?view=open";

const TAB_HREF: Record<InvoiceTab, string> = {
  all: INVOICES_HREF,
  open: OPEN_INVOICES_HREF,
  reminders: "/reminders",
  recurring: "/recurring",
};

export const invoiceTabHref = (tab: InvoiceTab): string => TAB_HREF[tab];

/** The tab of the invoice list itself; the URL alone decides, nothing is remembered between visits. */
export function invoiceListTab(querystring: string | undefined): "all" | "open" {
  return queryParam(querystring, "view") === "open" ? "open" : "all";
}

export type InvoiceTabCounts = { all: number; open: number; overdue: number; recurring: number };

type TabInvoice = Pick<
  InvoiceListRow,
  "status" | "isCreditNote" | "number" | "amountPaidCent" | "dueDate" | "settledByCreditNote"
>;

/** The same predicates as the tab contents, so a count always matches the list behind it. */
export function countInvoiceTabs(invoices: TabInvoice[], recurringCount: number, now: number): InvoiceTabCounts {
  return {
    all: invoices.length,
    open: invoices.filter((i) => canRecordPayments(i, i.settledByCreditNote)).length,
    overdue: invoices.filter((i) => isOverdue(i, i.settledByCreditNote, now)).length,
    recurring: recurringCount,
  };
}

type TabItem = { href: string; label: string; count?: number; tone?: "late" };

/** Without counts (still loading, or failed) the tabs show their labels only. */
export function invoiceTabItems(counts: InvoiceTabCounts | null): TabItem[] {
  return [
    { href: TAB_HREF.all, label: "Alle", count: counts?.all },
    { href: TAB_HREF.open, label: "Offen", count: counts?.open },
    {
      href: TAB_HREF.reminders,
      label: "Überfällig und Mahnungen",
      count: counts?.overdue,
      tone: counts && counts.overdue > 0 ? "late" : undefined,
    },
    { href: TAB_HREF.recurring, label: "Serien", count: counts?.recurring },
  ];
}
