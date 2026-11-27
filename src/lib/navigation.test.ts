import { describe, expect, it } from "vitest";
import { NAV_GROUPS, SETTINGS_NAV_ITEM, SETTINGS_PAGES, isNavItemActive, type NavItem } from "./navigation";

const items = NAV_GROUPS.flatMap((group) => group.items);
const item = (href: string): NavItem => {
  const found = items.find((candidate) => candidate.href === href);
  if (!found) throw new Error(`no navigation entry for ${href}`);
  return found;
};

describe("isNavItemActive", () => {
  it("keeps the overview active on the root only", () => {
    expect(isNavItemActive(item("/"), "/")).toBe(true);
    expect(isNavItemActive(item("/"), "/invoices")).toBe(false);
  });

  it("matches an entry's own path and its sub-pages, not look-alike prefixes", () => {
    expect(isNavItemActive(item("/invoices"), "/invoices/42/edit")).toBe(true);
    expect(isNavItemActive(item("/invoices"), "/invoices-archive")).toBe(false);
  });

  it("shows the invoice tabs under Rechnungen", () => {
    expect(isNavItemActive(item("/invoices"), "/reminders")).toBe(true);
    expect(isNavItemActive(item("/invoices"), "/reminders/new/7")).toBe(true);
    expect(isNavItemActive(item("/invoices"), "/recurring/3")).toBe(true);
  });

  it("shows the report pages under Auswertungen", () => {
    for (const location of ["/reports", "/reports/ustva", "/export", "/validate"]) {
      expect(isNavItemActive(item("/reports"), location)).toBe(true);
    }
  });

  it("activates exactly one main entry per page", () => {
    for (const location of ["/reminders", "/export", "/time/projects", "/customers/new"]) {
      expect(items.filter((candidate) => isNavItemActive(candidate, location))).toHaveLength(1);
    }
  });

  it("activates settings for every settings page", () => {
    expect(isNavItemActive(SETTINGS_NAV_ITEM, "/settings/data")).toBe(true);
    expect(isNavItemActive(SETTINGS_NAV_ITEM, "/reports")).toBe(false);
    for (const page of SETTINGS_PAGES) {
      expect(isNavItemActive(SETTINGS_NAV_ITEM, page.href)).toBe(true);
    }
  });
});

describe("SETTINGS_PAGES", () => {
  it("lists each page once, below the settings entry", () => {
    const hrefs = SETTINGS_PAGES.map((page) => page.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith(SETTINGS_NAV_ITEM.href + "/")).toBe(true);
  });

  it("starts with the company page, which `/settings` shows", () => {
    expect(SETTINGS_PAGES[0].href).toBe("/settings/company");
  });

  it("keeps the pages that other screens link to", () => {
    const hrefs: string[] = SETTINGS_PAGES.map((page) => page.href);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/settings/company",
        "/settings/documents",
        "/settings/appearance",
        "/settings/data",
        "/settings/advanced",
      ]),
    );
  });

  it("puts every business page before the app pages", () => {
    const groups = SETTINGS_PAGES.map((page) => page.group);
    expect(groups).toEqual([...groups].sort((a, b) => (a === b ? 0 : a === "business" ? -1 : 1)));
    expect(groups).toContain("business");
    expect(groups).toContain("app");
  });
});
