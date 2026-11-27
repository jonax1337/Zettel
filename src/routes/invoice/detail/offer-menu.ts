import { RefreshCw, Trash2, Undo2 } from "$lib/brand-icons";
import type { OfferActionId } from "../../offer/offer-actions";
import type { MenuEntry } from "./menu-entry";
import { PREVIEW_PDF_MENU, PREVIEWING_LABEL } from "./preview-menu";

type MenuDefinition = Pick<MenuEntry, "label" | "icon" | "group" | "destructive">;

const OFFER_MENU: Partial<Record<OfferActionId, MenuDefinition>> = {
  "preview-pdf": PREVIEW_PDF_MENU,
  "regenerate-pdf": { label: "PDF neu erzeugen", icon: RefreshCw, group: 0 },
  "reopen-draft": { label: "Zurück zu Entwurf", icon: Undo2, group: 1 },
  delete: { label: "Löschen", icon: Trash2, group: 2, destructive: true },
};

export function offerMenuEntries(
  ids: OfferActionId[],
  context: { busy: boolean; previewing: boolean; onSelect: (id: OfferActionId) => void },
): MenuEntry[] {
  return ids.flatMap((id) => {
    const definition = OFFER_MENU[id];
    if (!definition) return [];
    const entry = { ...definition, id, disabled: context.busy, onSelect: () => context.onSelect(id) };
    if (id === "preview-pdf" && context.previewing) entry.label = PREVIEWING_LABEL;
    return [entry];
  });
}
