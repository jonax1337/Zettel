import { select } from "./client";

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

const LIMIT = 10;

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

function formatDate(unix: number | null | undefined): string | null {
  if (!unix) return null;
  try {
    return new Date(unix * 1000).toLocaleDateString("de-DE");
  } catch {
    return null;
  }
}

function formatAmountCents(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export async function search(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q === "") return emptyResults();
  const like = `%${q}%`;

  const [invoiceRows, customerRows, vendorRows, expenseRows, offerRows, reminderRows] =
    await Promise.all([
      select<{
        id: number;
        number: string;
        status: string;
        customer_name: string | null;
        issue_date: number;
        total: number;
      }>(
        `SELECT i.id, i.number, i.status, c.name AS customer_name, i.issue_date, i.total
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
        [like, LIMIT],
      ),
      select<{
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
        [like, LIMIT],
      ),
      select<{
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
        [like, LIMIT],
      ),
      select<{
        id: number;
        internal_number: string;
        external_number: string | null;
        vendor_name: string | null;
        issue_date: number;
        total: number;
      }>(
        `SELECT e.id, e.internal_number, e.number AS external_number,
                v.name AS vendor_name, e.issue_date, e.total
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
        [like, LIMIT],
      ),
      select<{
        id: number;
        number: string;
        customer_name: string | null;
        issue_date: number;
        total: number;
      }>(
        `SELECT o.id, o.number, c.name AS customer_name, o.issue_date, o.total
         FROM offers o
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.number LIKE ?1 OR c.name LIKE ?1
         ORDER BY o.issue_date DESC, o.id DESC
         LIMIT ?2`,
        [like, LIMIT],
      ),
      select<{
        id: number;
        number: string;
        invoice_id: number;
        customer_name: string | null;
        issue_date: number;
        total_due_cents: number;
      }>(
        `SELECT r.id, r.number, r.invoice_id, c.name AS customer_name,
                r.issue_date, r.total_due_cents
         FROM reminders r
         LEFT JOIN invoices i ON i.id = r.invoice_id
         LEFT JOIN customers c ON c.id = i.customer_id
         WHERE r.number LIKE ?1 OR c.name LIKE ?1
         ORDER BY r.issue_date DESC, r.id DESC
         LIMIT ?2`,
        [like, LIMIT],
      ),
    ]);

  return {
    invoices: invoiceRows.map((r): SearchHit => {
      const isDraft = r.number.startsWith("DRAFT-");
      const displayNumber = isDraft && r.status === "draft" ? `Entwurf #${r.number.slice(6, 10)}` : r.number;
      return {
        kind: "invoice",
        id: r.id,
        number: displayNumber,
        primary: r.customer_name ?? "—",
        secondary: [formatDate(r.issue_date), formatAmountCents(r.total)]
          .filter(Boolean)
          .join(" · "),
        route: `/invoices/${r.id}`,
      };
    }),
    customers: customerRows.map((r): SearchHit => ({
      kind: "customer",
      id: r.id,
      number: r.customer_number,
      primary: r.name,
      secondary: r.email ?? r.city ?? null,
      route: `/customers/${r.id}`,
    })),
    vendors: vendorRows.map((r): SearchHit => ({
      kind: "vendor",
      id: r.id,
      number: r.vendor_number,
      primary: r.name,
      secondary: r.city ?? null,
      route: `/vendors/${r.id}`,
    })),
    expenses: expenseRows.map((r): SearchHit => ({
      kind: "expense",
      id: r.id,
      number: r.internal_number,
      primary: r.vendor_name ?? "—",
      secondary: [
        r.external_number ? `Ext.: ${r.external_number}` : null,
        formatDate(r.issue_date),
        formatAmountCents(r.total),
      ]
        .filter(Boolean)
        .join(" · "),
      route: `/expenses/${r.id}`,
    })),
    offers: offerRows.map((r): SearchHit => ({
      kind: "offer",
      id: r.id,
      number: r.number,
      primary: r.customer_name ?? "—",
      secondary: [formatDate(r.issue_date), formatAmountCents(r.total)]
        .filter(Boolean)
        .join(" · "),
      route: `/offers/${r.id}`,
    })),
    reminders: reminderRows.map((r): SearchHit => ({
      kind: "reminder",
      id: r.id,
      number: r.number,
      primary: r.customer_name ?? "—",
      secondary: [formatDate(r.issue_date), formatAmountCents(r.total_due_cents)]
        .filter(Boolean)
        .join(" · "),
      route: `/reminders/${r.id}`,
    })),
  };
}

export function flattenResults(r: SearchResults): SearchHit[] {
  return [
    ...r.invoices,
    ...r.customers,
    ...r.vendors,
    ...r.expenses,
    ...r.offers,
    ...r.reminders,
  ];
}
