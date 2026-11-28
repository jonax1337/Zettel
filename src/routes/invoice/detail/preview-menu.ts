import { FileSearch } from "$lib/brand-icons";
import type { MenuEntry } from "./menu-entry";

export const PREVIEW_PDF_LABEL = "PDF-Vorschau";
export const PREVIEWING_LABEL = "Erstelle Vorschau…";

/** The entry that opens a draft PDF of a document that is not issued yet. */
export const PREVIEW_PDF_MENU: Pick<MenuEntry, "label" | "icon" | "group"> = {
  label: PREVIEW_PDF_LABEL,
  icon: FileSearch,
  group: 0,
};
