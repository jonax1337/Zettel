import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import inventory from "../../../branding/buerofreund/ui-icons/app-icon-inventory.json";
import * as icons from "./index";

describe("Bürofreund icon replacement contract", () => {
  it("renders every icon imported by the app under the same export name", () => {
    for (const { name } of inventory.icons) {
      const component = icons[name as keyof typeof icons];
      expect(component, name).toBeTypeOf("function");
      const { body } = render(component);
      expect(body, name).toContain('viewBox="0 0 24 24"');
      expect(body, name).toContain('aria-hidden="true"');
      expect(body, name).toMatch(/<(path|rect|circle|ellipse)\b/);
    }
  });

  it("preserves existing SVG properties and supports accessible labels", () => {
    const { body } = render(icons.FileText, {
      props: {
        size: 32,
        color: "#F06B53",
        strokeWidth: 3,
        absoluteStrokeWidth: true,
        class: "size-5 invoice-icon",
        "aria-label": "Rechnung",
        "data-state": "ready",
        title: "Rechnung öffnen",
      },
    });

    expect(body).toContain('width="32"');
    expect(body).toContain('height="32"');
    expect(body).toContain('stroke="#F06B53"');
    expect(body).toContain('stroke-width="3"');
    expect(body).toContain("invoice-icon");
    expect(body).toContain('aria-label="Rechnung"');
    expect(body).toContain('role="img"');
    expect(body).not.toContain('aria-hidden="true"');
    expect(body).toContain('data-state="ready"');
    expect(body).toContain("Rechnung öffnen");
    expect(body).toContain('vector-effect="non-scaling-stroke"');

    const filledIcon = render(icons.GripVertical, {
      props: { color: "#F06B53" },
    });
    expect(filledIcon.body).toContain('color="#F06B53"');
    expect(filledIcon.body).toContain('fill="currentColor"');
  });
});
