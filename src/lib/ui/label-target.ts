const CONTROL_SELECTOR =
  "input:not([type=hidden]), textarea, select, button[role=combobox], [role=combobox], [role=switch]";

let idCounter = 0;

export function nextControlId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * The control a bare <Label> describes: the first form control in the label's
 * following siblings (or inside them). Forms lay out `<div><Label/><Input/></div>`,
 * so this pairs them without every call site having to thread an id through.
 */
export function findLabelTarget(label: HTMLElement): HTMLElement | null {
  for (let sibling = label.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
    if (sibling.matches(CONTROL_SELECTOR)) return sibling as HTMLElement;
    const nested = sibling.querySelector<HTMLElement>(CONTROL_SELECTOR);
    if (nested) return nested;
  }
  return null;
}

/** True for custom widgets (Bits UI select trigger) that a `for` attribute cannot label. */
export function needsAriaLabelledby(control: HTMLElement): boolean {
  return control.getAttribute("role") === "combobox" || control.getAttribute("role") === "switch";
}
