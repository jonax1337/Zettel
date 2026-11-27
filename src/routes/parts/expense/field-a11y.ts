const CONTROLS = "input, button, select, textarea, [role='spinbutton'], [role='combobox']";

/** Library controls (select, date picker) take no aria props, so the field marks them itself. */
export function markControls(root: HTMLElement, state: { invalid: boolean; required: boolean }): void {
  for (const control of root.querySelectorAll(CONTROLS)) {
    if (control.tagName === "BUTTON" && control.getAttribute("role") !== "combobox") continue;
    if (state.invalid) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");
    if (state.required) control.setAttribute("aria-required", "true");
    else control.removeAttribute("aria-required");
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
