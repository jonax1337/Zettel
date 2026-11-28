import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_GROUPS, REPORT_PAGES } from "$lib/navigation";
import { REPORT_TABS } from "./report-tabs";

describe("REPORT_TABS", () => {
  it("starts with the overview and then lists the report pages in navigation order", () => {
    expect(REPORT_TABS[0].href).toBe("/reports");
    expect(REPORT_TABS.slice(1).map((tab) => tab.href)).toEqual(REPORT_PAGES.map((page) => page.href));
  });

  it("keeps the sidebar entry Auswertungen active on every tab", () => {
    const reports = NAV_GROUPS.flatMap((group) => group.items).find((item) => item.href === "/reports");
    expect(reports).toBeDefined();
    for (const tab of REPORT_TABS) expect(isNavItemActive(reports!, tab.href), tab.href).toBe(true);
  });
});
