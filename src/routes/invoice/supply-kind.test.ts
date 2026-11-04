import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUPPLY_KIND,
  SUPPLY_KIND_HINT,
  SUPPLY_KIND_ITEMS,
  SUPPLY_KIND_LABEL,
} from "./supply-kind";

describe("supply kind options", () => {
  it("defaults new documents to services", () => {
    expect(DEFAULT_SUPPLY_KIND).toBe("services");
  });

  it("offers each supply kind exactly once, labelled", () => {
    expect(SUPPLY_KIND_ITEMS.map((item) => item.value).sort()).toEqual(["goods", "services"]);
    for (const item of SUPPLY_KIND_ITEMS) {
      expect(item.label).toBe(SUPPLY_KIND_LABEL[item.value]);
    }
  });

  it("names the UStVA line in each hint", () => {
    expect(SUPPLY_KIND_HINT.intra_eu.goods).toContain("41");
    expect(SUPPLY_KIND_HINT.intra_eu.services).toContain("21");
    expect(SUPPLY_KIND_HINT.third_country.goods).toContain("43");
    expect(SUPPLY_KIND_HINT.third_country.services).toContain("45");
  });
});
