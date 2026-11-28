import { describe, expect, it } from "vitest";
import {
  INVOICES_HREF,
  OPEN_INVOICES_HREF,
  countInvoiceTabs,
  invoiceTabHref,
  invoiceListTab,
  invoiceTabItems,
} from "./invoice-tabs";

const NOW = 1_800_000_000;
const DAY = 86_400;

const row = (overrides: Partial<Parameters<typeof countInvoiceTabs>[0][number]> = {}) => ({
  status: "sent" as const,
  isCreditNote: false,
  number: "RE-2026-0001",
  amountPaidCent: 0,
  dueDate: NOW + DAY,
  settledByCreditNote: false,
  ...overrides,
});

const queryOf = (href: string) => href.split("?")[1];

describe("invoiceListTab", () => {
  it("shows Offen only for view=open", () => {
    expect(invoiceListTab("view=open")).toBe("open");
    expect(invoiceListTab("customerId=3&view=open")).toBe("open");
    expect(invoiceListTab("view=all")).toBe("all");
    expect(invoiceListTab("")).toBe("all");
    expect(invoiceListTab(undefined)).toBe("all");
  });

  it("follows the tab links, so arriving from Offen via Alle shows all invoices again", () => {
    expect(invoiceListTab(queryOf(OPEN_INVOICES_HREF))).toBe("open");
    expect(invoiceListTab(queryOf(INVOICES_HREF))).toBe("all");
    // Alle, Offen, Alle in a row: each arrival depends on its own URL only.
    const visits = [INVOICES_HREF, OPEN_INVOICES_HREF, INVOICES_HREF].map((href) => invoiceListTab(queryOf(href)));
    expect(visits).toEqual(["all", "open", "all"]);
  });

  it("opens the plain sidebar link on Alle, as an arrival from another tab does", () => {
    expect(invoiceTabHref("all")).toBe(INVOICES_HREF);
    expect(invoiceListTab(queryOf(invoiceTabHref("all")))).toBe("all");
  });
});

describe("countInvoiceTabs", () => {
  it("counts all, open and overdue invoices with the list predicates", () => {
    const counts = countInvoiceTabs(
      [
        row({ status: "draft" }),
        row({ status: "paid", amountPaidCent: 100 }),
        row(),
        row({ status: "partial", dueDate: NOW - 3 * DAY }),
        row({ isCreditNote: true }),
        row({ dueDate: NOW - DAY, settledByCreditNote: true }),
      ],
      2,
      NOW,
    );
    expect(counts).toEqual({ all: 6, open: 2, overdue: 1, recurring: 2 });
  });
});

describe("invoiceTabItems", () => {
  it("shows labels only while the counts are missing", () => {
    const items = invoiceTabItems(null);
    expect(items.map((i) => i.label)).toEqual(["Alle", "Offen", "Überfällig und Mahnungen", "Serien"]);
    expect(items.every((i) => i.count === undefined && i.tone === undefined)).toBe(true);
  });

  it("marks the overdue tab late only when something is overdue", () => {
    const late = invoiceTabItems({ all: 5, open: 3, overdue: 2, recurring: 1 });
    expect(late[2]).toMatchObject({ count: 2, tone: "late" });
    const calm = invoiceTabItems({ all: 5, open: 3, overdue: 0, recurring: 1 });
    expect(calm[2].tone).toBeUndefined();
  });

  it("links every tab to its screen", () => {
    expect(invoiceTabItems(null).map((i) => i.href)).toEqual([
      invoiceTabHref("all"),
      invoiceTabHref("open"),
      "/reminders",
      "/recurring",
    ]);
  });
});
