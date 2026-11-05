import { containsPattern, select } from "./client";
import { DEFAULT_CURRENCY, MISSING_NAME } from "./doc-queries";
import { displayInvoiceNumber } from "./invoices";
import type { InvoiceStatus } from "./schema";
import { formatDate } from "$lib/utils/date";
import { formatMoney } from "$lib/utils/currency";

export type SearchHitKind =
  | "invoice"
  | "customer"
  | "vendor"
  | "expense"
  | "offer"
  | "reminder";

export type SearchHit = {
  kind: SearchHitKind;
  id: number;
  number: string;
  primary: string;
  secondary: string | null;
  route: string;
};

export type SearchResults = {
  invoices: SearchHit[];
  customers: SearchHit[];
  vendors: SearchHit[];
  expenses: SearchHit[];
  offers: SearchHit[];
  reminders: SearchHit[];
};

const RESULTS_PER_KIND = 10;
const DETAIL_SEPARATOR = " · ";

function emptyResults(): SearchResults {
  return {
    invoices: [],
    customers: [],
    vendors: [],
    expenses: [],
    offers: [],
    reminders: [],
  };
}

function joinDetails(parts: Array<string | null>): string {
  return parts.filter(Boolean).join(DETAIL_SEPARATOR);
}

function dateDetail(unix: number): string | null {
  return unix ? formatDate(unix) : null;
}

async function searchInvoices(like: string): Promise<SearchHit[]> {
  const rows = await select<{
    id: number;
    number: string;
    status: InvoiceStatus;
    customer_name: string | null;
    issue_date: number;
    total: number;
    currency: string;
  }>(
    `SELECT i.id, i.number, i.status, c.name AS customer_name, i.issue_date, i.total, i.currency
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.number LIKE ?1
        OR c.name LIKE ?1
        OR EXISTS (
          SELECT 1 FROM invoice_items ii
          WHERE ii.invoice_id = i.id AND ii.description LIKE ?1
        )
     ORDER BY i.issue_date DESC, i.id DESC
     LIMIT ?2`,
    [like, RESULTS_PER_KIND],
  );
  return rows.map((r) => ({
    kind: "invoice",
    id: r.id,
    number: displayInvoiceNumber(r),
    primary: r.customer_name ?? MISSING_NAME,
    secondary: joinDetails([dateDetail(r.issue_date), formatMoney(r.total, r.currency)]),
    route: `/invoices/${r.id}`,
  }));
}

async function searchCustomers(like: string): Promise<SearchHit[]> {
  const rows = await select<{
    id: number;
    customer_number: string;
    name: string;
    email: string | null;
    city: string | null;
  }>(
    `SELECT id, customer_number, name, email, city
     FROM customers
     WHERE customer_number LIKE ?1 OR name LIKE ?1 OR email LIKE ?1
     ORDER BY name COLLATE NOCASE ASC
     LIMIT ?2`,
    [like, RESULTS_PER_KIND],
  );
  return rows.map((r) => ({
    kind: "customer",
    id: r.id,
    number: r.customer_number,
    primary: r.name,
    secondary: r.email ?? r.city ?? null,
    route: `/customers/${r.id}`,
  }));
}

async function searchVendors(like: string): Promise<SearchHit[]> {
  const rows = await select<{
    id: number;
    vendor_number: string;
    name: string;
    city: string | null;
  }>(
    `SELECT id, vendor_number, name, city
     FROM vendors
     WHERE vendor_number LIKE ?1 OR name LIKE ?1
     ORDER BY name COLLATE NOCASE ASC
     LIMIT ?2`,
    [like, RESULTS_PER_KIND],
  );
  return rows.map((r) => ({
    kind: "vendor",
    id: r.id,
    number: r.vendor_number,
    primary: r.name,
    secondary: r.city ?? null,
    route: `/vendors/${r.id}`,
  }));
}

async function searchExpenses(like: string): Promise<SearchHit[]> {
  const rows = await select<{
    id: number;
    internal_number: string;
    external_number: string | null;
    vendor_name: string | null;
    issue_date: number;
    total: number;
    currency: string;
  }>(
    `SELECT e.id, e.internal_number, e.number AS external_number,
            v.name AS vendor_name, e.issue_date, e.total, e.currency
     FROM expenses e
     LEFT JOIN vendors v ON v.id = e.vendor_id
     WHERE e.internal_number LIKE ?1
        OR v.name LIKE ?1
        OR EXISTS (
          SELECT 1 FROM expense_items ei
          WHERE ei.expense_id = e.id AND ei.description LIKE ?1
        )
     ORDER BY e.issue_date DESC, e.id DESC
     LIMIT ?2`,
    [like, RESULTS_PER_KIND],
  );
  return rows.map((r) => ({
    kind: "expense",
    id: r.id,
    number: r.internal_number,
    primary: r.vendor_name ?? MISSING_NAME,
    secondary: joinDetails([
      r.external_number ? `Ext.: ${r.external_number}` : null,
      dateDetail(r.issue_date),
      formatMoney(r.total, r.currency),
    ]),
    route: `/expenses/${r.id}`,
  }));
}

async function searchOffers(like: string): Promise<SearchHit[]> {
  const rows = await select<{
    id: number;
    number: string;
    customer_name: string | null;
    issue_date: number;
    total: number;
    currency: string;
  }>(
    `SELECT o.id, o.number, c.name AS customer_name, o.issue_date, o.total, o.currency
     FROM offers o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.number LIKE ?1 OR c.name LIKE ?1
     ORDER BY o.issue_date DESC, o.id DESC
     LIMIT ?2`,
    [like, RESULTS_PER_KIND],
  );
  return rows.map((r) => ({
    kind: "offer",
    id: r.id,
    number: r.number,
    primary: r.customer_name ?? MISSING_NAME,
    secondary: joinDetails([dateDetail(r.issue_date), formatMoney(r.total, r.currency)]),
    route: `/offers/${r.id}`,
  }));
}

async function searchReminders(like: string): Promise<SearchHit[]> {
  const rows = await select<{
    id: number;
    number: string;
    customer_name: string | null;
    issue_date: number;
    total_due_cents: number;
    currency: string | null;
  }>(
    `SELECT r.id, r.number, c.name AS customer_name, r.issue_date, r.total_due_cents, i.currency
     FROM reminders r
     LEFT JOIN invoices i ON i.id = r.invoice_id
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE r.number LIKE ?1 OR c.name LIKE ?1
     ORDER BY r.issue_date DESC, r.id DESC
     LIMIT ?2`,
    [like, RESULTS_PER_KIND],
  );
  return rows.map((r) => ({
    kind: "reminder",
    id: r.id,
    number: r.number,
    primary: r.customer_name ?? MISSING_NAME,
    secondary: joinDetails([dateDetail(r.issue_date), formatMoney(r.total_due_cents, r.currency ?? DEFAULT_CURRENCY)]),
    route: `/reminders/${r.id}`,
  }));
}

export async function search(query: string): Promise<SearchResults> {
  const like = containsPattern(query);
  if (like === null) return emptyResults();

  const [invoices, customers, vendors, expenses, offers, reminders] = await Promise.all([
    searchInvoices(like),
    searchCustomers(like),
    searchVendors(like),
    searchExpenses(like),
    searchOffers(like),
    searchReminders(like),
  ]);
  return { invoices, customers, vendors, expenses, offers, reminders };
}
