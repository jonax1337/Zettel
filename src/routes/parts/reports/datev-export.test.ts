import { describe, expect, it } from "vitest";
import type { ExpenseCategory } from "$lib/db/schema";
import { fromIsoDate } from "$lib/utils/date";
import {
  describeExportCounts,
  endOfDayUnix,
  fiscalYearStart,
  resolveItemAccounts,
} from "./datev-export";

const hosting = {
  id: 1,
  name: "Hosting",
  datevAccountSkr03: "4930",
  datevAccountSkr04: "6805",
} as ExpenseCategory;
const withoutAccount = {
  id: 2,
  name: "Sonstiges",
  datevAccountSkr03: null,
  datevAccountSkr04: null,
} as ExpenseCategory;
const categories = new Map([hosting, withoutAccount].map((c) => [c.id, c]));

describe("fiscalYearStart", () => {
  it("is January 1st of the year the range starts in, not of the current year", () => {
    const start = fiscalYearStart(fromIsoDate("2024-07-15"));
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2024, 0, 1]);
  });

  it("stays in the same year on December 31st", () => {
    expect(fiscalYearStart(fromIsoDate("2025-12-31")).getFullYear()).toBe(2025);
  });
});

describe("endOfDayUnix", () => {
  it("ends on 23:59:59 of the same local day, also on days with a DST switch", () => {
    for (const iso of ["2026-01-15", "2026-03-29", "2026-10-25"]) {
      const end = new Date(endOfDayUnix(fromIsoDate(iso)) * 1000);
      const [year, month, day] = iso.split("-").map(Number);
      expect([end.getFullYear(), end.getMonth() + 1, end.getDate()]).toEqual([year, month, day]);
      expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
    }
  });
});

describe("resolveItemAccounts", () => {
  it("takes the account of the category for the chosen SKR", () => {
    const [item] = resolveItemAccounts([{ categoryId: 1, datevAccount: null }], categories, "SKR03");
    expect(item.datevAccount).toBe("4930");
    const [skr04] = resolveItemAccounts([{ categoryId: 1, datevAccount: null }], categories, "SKR04");
    expect(skr04.datevAccount).toBe("6805");
  });

  it("keeps an explicitly entered account", () => {
    const [item] = resolveItemAccounts([{ categoryId: 1, datevAccount: "4999" }], categories, "SKR04");
    expect(item.datevAccount).toBe("4999");
  });

  it("replaces the SKR03 account that older versions stored as a hint when exporting SKR04", () => {
    const [item] = resolveItemAccounts([{ categoryId: 1, datevAccount: "4930" }], categories, "SKR04");
    expect(item.datevAccount).toBe("6805");
  });

  it("keeps the stored SKR03 account of the category when exporting SKR03", () => {
    const [item] = resolveItemAccounts([{ categoryId: 1, datevAccount: "4930" }], categories, "SKR03");
    expect(item.datevAccount).toBe("4930");
  });

  it("keeps an SKR03 account that belongs to another category when exporting SKR04", () => {
    const [item] = resolveItemAccounts([{ categoryId: 1, datevAccount: "4910" }], categories, "SKR04");
    expect(item.datevAccount).toBe("4910");
  });

  it("keeps a stale-looking account on an item without a category", () => {
    const [item] = resolveItemAccounts([{ categoryId: null, datevAccount: "4930" }], categories, "SKR04");
    expect(item.datevAccount).toBe("4930");
  });

  it("leaves items without a category or with an unknown category alone", () => {
    const items = [
      { categoryId: null, datevAccount: null },
      { categoryId: 99, datevAccount: null },
    ];
    expect(resolveItemAccounts(items, categories, "SKR03")).toEqual(items);
  });

  it("keeps the account empty when the category has none for this SKR", () => {
    const [item] = resolveItemAccounts([{ categoryId: 2, datevAccount: null }], categories, "SKR03");
    expect(item.datevAccount).toBeNull();
  });

  it("does not touch the passed items", () => {
    const original = { categoryId: 1, datevAccount: null };
    resolveItemAccounts([original], categories, "SKR03");
    expect(original.datevAccount).toBeNull();
  });
});

describe("describeExportCounts", () => {
  it("names both document kinds with the right plural", () => {
    expect(describeExportCounts(1, 2)).toBe("1 Rechnung + 2 Eingangsrechnungen");
    expect(describeExportCounts(3, 1)).toBe("3 Rechnungen + 1 Eingangsrechnung");
  });

  it("omits a kind without documents", () => {
    expect(describeExportCounts(2, 0)).toBe("2 Rechnungen");
    expect(describeExportCounts(0, 1)).toBe("1 Eingangsrechnung");
  });
});
