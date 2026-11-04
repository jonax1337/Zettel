import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "$lib/navigation";
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

  it("reaches validation, tax and every settings category", () => {
    const routes = commands.map((c) => c.route);
    expect(routes).toEqual(
      expect.arrayContaining([
        "/validate",
        "/reports/taxes",
        "/settings/company",
        "/settings/documents",
        "/settings/appearance",
        "/settings/data",
        "/settings/advanced",
      ]),
    );
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

  it("finds the validator", () => {
    expect(labels(filterCommands(commands, "valid"))).toContain("E-Rechnung validieren");
  });

  it("returns nothing when no command fits", () => {
    expect(filterCommands(commands, "zzzzzz")).toEqual([]);
  });
});
