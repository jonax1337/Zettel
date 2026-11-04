import { cn } from "$lib/utils";

export const DIALOG_OVERLAY_CLASS =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50";

export const DIALOG_CONTENT_ANIMATION_CLASS =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

/** Row of a keyboard-navigable result list inside a picker dialog. */
export function pickerRowClass(active: boolean): string {
  return cn(
    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
    active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
  );
}
