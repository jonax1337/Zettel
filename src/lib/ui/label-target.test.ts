import { describe, expect, it } from "vitest";
import { findLabelTarget, needsAriaLabelledby, nextControlId } from "./label-target";

type Fake = {
  tag: string;
  role?: string;
  next?: Fake;
  children?: Fake[];
};

const CONTROL_TAGS = ["input", "textarea", "select"];

function isControl(node: Fake): boolean {
  return CONTROL_TAGS.includes(node.tag) || node.role === "combobox" || node.role === "switch";
}

function firstNestedControl(node: Fake): Fake | undefined {
  for (const child of node.children ?? []) {
    if (isControl(child)) return child;
    const nested = firstNestedControl(child);
    if (nested) return nested;
  }
  return undefined;
}

/** Minimal stand-in for the DOM members label-target touches (tests run in node, not a browser). */
function el(spec: Fake): HTMLElement {
  return {
    matches: () => isControl(spec),
    querySelector: () => {
      const hit = firstNestedControl(spec);
      return hit ? el(hit) : null;
    },
    get nextElementSibling() {
      return spec.next ? el(spec.next) : null;
    },
    getAttribute: (name: string) => (name === "role" ? (spec.role ?? null) : null),
  } as unknown as HTMLElement;
}

describe("findLabelTarget", () => {
  it("returns the sibling control directly after the label", () => {
    const label = el({ tag: "label", next: { tag: "input" } });
    expect(findLabelTarget(label)).not.toBeNull();
  });

  it("finds a control nested inside a following wrapper", () => {
    const label = el({
      tag: "label",
      next: { tag: "div", children: [{ tag: "div", children: [{ tag: "select" }] }] },
    });
    expect(findLabelTarget(label)).not.toBeNull();
  });

  it("skips non-control siblings", () => {
    const label = el({ tag: "label", next: { tag: "p", next: { tag: "textarea" } } });
    expect(findLabelTarget(label)).not.toBeNull();
  });

  it("returns null when no control follows", () => {
    const label = el({ tag: "label", next: { tag: "p" } });
    expect(findLabelTarget(label)).toBeNull();
  });
});

describe("needsAriaLabelledby", () => {
  it("is true for combobox and switch widgets only", () => {
    expect(needsAriaLabelledby(el({ tag: "button", role: "combobox" }))).toBe(true);
    expect(needsAriaLabelledby(el({ tag: "button", role: "switch" }))).toBe(true);
    expect(needsAriaLabelledby(el({ tag: "input" }))).toBe(false);
  });
});

describe("nextControlId", () => {
  it("never repeats", () => {
    expect(nextControlId("field")).not.toBe(nextControlId("field"));
  });
});
