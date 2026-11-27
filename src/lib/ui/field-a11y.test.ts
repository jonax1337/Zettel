import { describe, expect, it, vi } from "vitest";
import { focusFirstInvalid, markControls } from "./field-a11y";

class FakeControl {
  attrs = new Map<string, string>();
  constructor(
    readonly tagName: string,
    role?: string,
  ) {
    if (role) this.attrs.set("role", role);
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
  removeAttribute(name: string) {
    this.attrs.delete(name);
  }
  querySelector: (selector: string) => unknown = () => null;
  hasAttribute(name: string) {
    return this.attrs.has(name);
  }
  scrollIntoView = vi.fn();
  focus = vi.fn();
}

const rootOf = (controls: FakeControl[]) =>
  ({
    querySelectorAll: () => controls,
    querySelector: () => controls.find((c) => c.getAttribute("aria-invalid") === "true") ?? null,
  }) as unknown as ParentNode;

describe("markControls", () => {
  it("sets aria-invalid and aria-required on inputs and comboboxes", () => {
    const input = new FakeControl("INPUT");
    const combobox = new FakeControl("BUTTON", "combobox");
    markControls(rootOf([input, combobox]), { invalid: true, required: true });
    for (const control of [input, combobox]) {
      expect(control.getAttribute("aria-invalid")).toBe("true");
      expect(control.getAttribute("aria-required")).toBe("true");
    }
  });

  it("leaves plain buttons alone", () => {
    const button = new FakeControl("BUTTON");
    markControls(rootOf([button]), { invalid: true, required: true });
    expect(button.getAttribute("aria-invalid")).toBeNull();
  });

  it("never removes marks the control set itself", () => {
    const own = new FakeControl("INPUT");
    own.setAttribute("aria-invalid", "true");
    own.setAttribute("aria-required", "true");
    markControls(rootOf([own]), { invalid: false, required: false });
    expect(own.getAttribute("aria-invalid")).toBe("true");
    expect(own.getAttribute("aria-required")).toBe("true");
  });

  it("leaves a control's own aria-invalid alone when the field has an error too", () => {
    const own = new FakeControl("INPUT");
    own.setAttribute("aria-invalid", "false");
    markControls(rootOf([own]), { invalid: true, required: false });
    markControls(rootOf([own]), { invalid: false, required: false });
    expect(own.getAttribute("aria-invalid")).toBe("false");
  });

  it("links the error or hint through aria-describedby without dropping other ids", () => {
    const input = new FakeControl("INPUT");
    input.setAttribute("aria-describedby", "other");
    markControls(rootOf([input]), { invalid: false, required: false, messageId: "m1", hasMessage: true });
    markControls(rootOf([input]), { invalid: false, required: false, messageId: "m1", hasMessage: true });
    expect(input.getAttribute("aria-describedby")).toBe("other m1");
    markControls(rootOf([input]), { invalid: false, required: false, messageId: "m1", hasMessage: false });
    expect(input.getAttribute("aria-describedby")).toBe("other");
  });

  it("names a date field group by the field's label, but not a group that has a name", () => {
    const group = new FakeControl("DIV", "group");
    const named = new FakeControl("DIV", "group");
    named.setAttribute("aria-label", "Zeitraum");
    const root = {
      querySelectorAll: (selector: string) =>
        selector.includes("role='group'") ? [group, named] : [],
    } as unknown as ParentNode;
    group.querySelector = () => new FakeControl("SPAN", "spinbutton");
    named.querySelector = group.querySelector;
    markControls(root, { invalid: false, required: false, labelId: "l1" });
    expect(group.getAttribute("aria-labelledby")).toBe("l1");
    expect(named.getAttribute("aria-labelledby")).toBeNull();
  });

  it("removes the marks once the field is valid again", () => {
    const input = new FakeControl("INPUT");
    markControls(rootOf([input]), { invalid: true, required: true });
    markControls(rootOf([input]), { invalid: false, required: false });
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-required")).toBeNull();
  });
});

describe("focusFirstInvalid", () => {
  it("focuses and scrolls to the first invalid control", () => {
    const ok = new FakeControl("INPUT");
    const bad = new FakeControl("INPUT");
    bad.setAttribute("aria-invalid", "true");
    expect(focusFirstInvalid(rootOf([ok, bad]))).toBe(true);
    expect(bad.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(bad.scrollIntoView).toHaveBeenCalled();
    expect(ok.focus).not.toHaveBeenCalled();
  });

  it("reports false when nothing is invalid", () => {
    expect(focusFirstInvalid(rootOf([new FakeControl("INPUT")]))).toBe(false);
  });
});
