const CONTROLS = "input, button, select, textarea, [role='spinbutton'], [role='combobox']";

/** Remembers which marks a field set itself, so it never removes what a control or library set on its own. */
const OWN_INVALID = "data-field-invalid";
const OWN_REQUIRED = "data-field-required";
const OWN_LABELLEDBY = "data-field-labelledby";

export type FieldState = {
  invalid: boolean;
  required: boolean;
  /** Stable id of the element that shows the field's error or hint. */
  messageId?: string;
  hasMessage?: boolean;
  /** Id of the field's label, used to name groups the label-target helper cannot pair (date fields). */
  labelId?: string;
};

function mark(control: Element, attribute: string, ownMarker: string, on: boolean): void {
  if (on) {
    if (control.hasAttribute(attribute)) return;
    control.setAttribute(attribute, "true");
    control.setAttribute(ownMarker, "");
  } else if (control.hasAttribute(ownMarker)) {
    control.removeAttribute(attribute);
    control.removeAttribute(ownMarker);
  }
}

function describe(control: Element, messageId: string, hasMessage: boolean): void {
  const tokens = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const rest = tokens.filter((token) => token !== messageId);
  if (hasMessage) rest.push(messageId);
  if (rest.length > 0) control.setAttribute("aria-describedby", rest.join(" "));
  else control.removeAttribute("aria-describedby");
}

/** Library controls (select, date picker) take no aria props, so the field marks them itself. */
export function markControls(root: ParentNode, state: FieldState): void {
  for (const control of root.querySelectorAll(CONTROLS)) {
    if (control.tagName === "BUTTON" && control.getAttribute("role") !== "combobox") continue;
    mark(control, "aria-invalid", OWN_INVALID, state.invalid);
    mark(control, "aria-required", OWN_REQUIRED, state.required);
    if (state.messageId) describe(control, state.messageId, Boolean(state.hasMessage));
  }
  if (!state.labelId) return;
  for (const group of root.querySelectorAll("[role='group']")) {
    if (group.hasAttribute("aria-label")) continue;
    if (group.hasAttribute("aria-labelledby") && !group.hasAttribute(OWN_LABELLEDBY)) continue;
    if (!group.querySelector("[role='spinbutton']")) continue;
    group.setAttribute("aria-labelledby", state.labelId);
    group.setAttribute(OWN_LABELLEDBY, "");
  }
}

/** Scrolls to and focuses the first invalid control, so a failed save is visible off-screen. */
export function focusFirstInvalid(root: ParentNode): boolean {
  const target = root.querySelector<HTMLElement>("[aria-invalid='true']");
  if (!target) return false;
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.focus({ preventScroll: true });
  return true;
}
