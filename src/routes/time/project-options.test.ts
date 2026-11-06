import { describe, expect, it } from "vitest";
import { customerFilterOptions, projectFilterItems, projectLabel, selectableProjects } from "./project-options";

function project(id: number, customerId: number, name: string, archived = false) {
  return { id, customerId, customerName: `Kunde ${customerId}`, name, archived };
}

const website = project(1, 1, "Website");
const app = project(2, 1, "App", true);
const beratung = project(3, 2, "Beratung");

describe("projectLabel", () => {
  it("names the customer before the project", () => {
    expect(projectLabel(website)).toBe("Kunde 1 · Website");
  });
});

describe("selectableProjects", () => {
  it("hides archived projects", () => {
    expect(selectableProjects([website, app, beratung]).map((p) => p.id)).toEqual([1, 3]);
  });

  it("keeps the archived project an existing entry already belongs to", () => {
    expect(selectableProjects([website, app, beratung], 2).map((p) => p.id)).toEqual([1, 2, 3]);
  });
});

describe("projectFilterItems", () => {
  it("offers every project, archived ones included, under all customers", () => {
    expect(projectFilterItems([website, app, beratung], "all").map((i) => i.value)).toEqual(["all", "1", "2", "3"]);
  });

  it("offers only the projects of the chosen customer", () => {
    expect(projectFilterItems([website, app, beratung], "2")).toEqual([
      { value: "all", label: "Alle Projekte" },
      { value: "3", label: "Beratung" },
    ]);
  });
});

describe("customerFilterOptions", () => {
  it("lists each customer with projects once", () => {
    expect(customerFilterOptions([website, app, beratung])).toEqual([
      { id: 1, name: "Kunde 1" },
      { id: 2, name: "Kunde 2" },
    ]);
  });
});
