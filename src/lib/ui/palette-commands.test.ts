import { describe, expect, it } from "vitest";
import { NAV_GROUPS, SETTINGS_NAV_ITEM, SETTINGS_PAGES } from "$lib/navigation";
import { buildPaletteCommands, filterCommands } from "./palette-commands";

const commands = buildPaletteCommands();
const labels = (found: { label: string }[]) => found.map((c) => c.label);

describe("palette commands", () => {
  it("offers a create action for the main documents", () => {
    for (const label of ["Neue Rechnung", "Neues Angebot", "Neuer Kunde", "Neue Ausgabe"]) {
      expect(labels(commands)).toContain(label);
    }
  });

  it("reaches every page of the sidebar", () => {
    const routes = commands.filter((c) => c.group === "navigate").map((c) => c.route);
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      expect(routes).toContain(item.href);
    }
  });

  it("reaches the settings link of the sidebar footer", () => {
    const routes = commands.filter((c) => c.group === "navigate").map((c) => c.route);
    expect(routes).toContain(SETTINGS_NAV_ITEM.href);
  });

  it("still reaches every page that lost its own sidebar entry", () => {
    const reached = new Map(
      commands.filter((c) => c.group === "navigate").map((c) => [c.route, c.label]),
    );
    expect(Object.fromEntries(reached)).toMatchObject({
      "/reminders": "Mahnungen",
      "/recurring": "Wiederkehrende Rechnungen",
      "/reports/ustva": "UStVA",
      "/reports/euer": "Anlage EÜR",
      "/reports/taxes": "Steuer-Rücklage",
      "/export": "DATEV-Export",
      "/validate": "E-Rechnung prüfen",
      "/settings": "Einstellungen",
    });
  });

  it("reaches validation, tax and every settings page", () => {
    const routes = commands.map((c) => c.route);
    expect(routes).toEqual(
      expect.arrayContaining(["/validate", "/reports/taxes", ...SETTINGS_PAGES.map((p) => p.href)]),
    );
  });

  it("finds each settings page by the settings on it and by its former names", () => {
    const found = (query: string) => filterCommands(commands, query).map((c) => c.route);
    expect(found("backup")).toContain("/settings/data");
    expect(found("sandbox")).toContain("/settings/data");
    expect(found("beta")).toContain("/settings/updates");
    expect(found("kleinunternehmer")).toContain("/settings/tax");
    expect(found("iban")).toContain("/settings/company");
    expect(found("nummernkreis")).toContain("/settings/documents");
    expect(found("logo")).toContain("/settings/company");
    expect(found("dokumente")).toContain("/settings/documents");
    expect(found("erweitert")).toContain("/settings/advanced");
    expect(found("eür")).toContain("/settings/tax");
  });

  it("names the settings pages after the sub-navigation", () => {
    expect(labels(filterCommands(commands, "einstellungen steuern"))).toContain("Einstellungen: Steuern");
    expect(labels(filterCommands(commands, "gefahrenbereich"))).toContain("Einstellungen: Gefahrenbereich");
    expect(labels(filterCommands(commands, "updates"))).toContain("Einstellungen: Updates");
  });

  it("has unique ids", () => {
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
  });
});

describe("filterCommands", () => {
  it("returns everything for an empty query", () => {
    expect(filterCommands(commands, "  ")).toEqual(commands);
  });

  it("matches words in any order, ignoring case and umlauts", () => {
    expect(labels(filterCommands(commands, "rechnung neue"))).toContain("Neue Rechnung");
    expect(labels(filterCommands(commands, "rucklage"))).toContain("Steuer-Rücklage");
    expect(labels(filterCommands(commands, "RÜCKLAGE"))).toContain("Steuer-Rücklage");
  });

  it("matches on keywords that are not in the label", () => {
    expect(labels(filterCommands(commands, "eingangsrechnung beleg"))).toContain("Neue Ausgabe");
  });

  it("finds renamed pages under their former names", () => {
    expect(labels(filterCommands(commands, "dashboard"))).toContain("Übersicht");
    expect(labels(filterCommands(commands, "zeiterfassung"))).toContain("Zeiten");
    expect(labels(filterCommands(commands, "bank-import"))).toContain("Bank-Abgleich");
    expect(labels(filterCommands(commands, "eingangsrechnungen"))).toContain("Ausgaben");
  });

  it("finds the validator", () => {
    expect(labels(filterCommands(commands, "valid"))).toContain("E-Rechnung prüfen");
  });

  it("returns nothing when no command fits", () => {
    expect(filterCommands(commands, "zzzzzz")).toEqual([]);
  });
});
