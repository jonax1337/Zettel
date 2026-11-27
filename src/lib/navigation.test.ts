import { describe, expect, it } from "vitest";
import { NAV_GROUPS, SETTINGS_NAV_ITEM, isNavItemActive, type NavItem } from "./navigation";

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
  });
});
