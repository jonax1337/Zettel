import { Ban, Check, CheckCircle2, Clock, FileDown, RefreshCw, Repeat, Send, Trash2, Undo2 } from "$lib/brand-icons";
import type { InvoiceActionId } from "./invoice-action-plan";
import type { MenuEntry } from "./menu-entry";

type MenuDefinition = Pick<MenuEntry, "label" | "icon" | "group" | "destructive">;

const EVERYDAY = 0;
const REVERSING = 1;
const REMOVING = 2;

const INVOICE_MENU: Partial<Record<InvoiceActionId, MenuDefinition>> = {
  "send-mail": { label: "Per E-Mail senden", icon: Send, group: EVERYDAY },
  "mark-sent": { label: "Als versendet markieren", icon: Check, group: EVERYDAY },
  "mark-paid": { label: "Als bezahlt markieren", icon: CheckCircle2, group: EVERYDAY },
  "regenerate-pdf": { label: "PDF neu erzeugen", icon: RefreshCw, group: EVERYDAY },
  "export-xrechnung": { label: "XRechnung exportieren", icon: FileDown, group: EVERYDAY },
  "save-recurring": { label: "Als wiederkehrende Rechnung speichern", icon: Repeat, group: EVERYDAY },
  "release-time": { label: "Zeiten wieder freigeben", icon: Clock, group: EVERYDAY },
  "create-credit-note": { label: "Stornorechnung erstellen", icon: Ban, group: REVERSING, destructive: true },
  "reopen-draft": { label: "Zurück zu Entwurf", icon: Undo2, group: REVERSING },
  cancel: { label: "Entwurf stornieren", icon: Ban, group: REVERSING, destructive: true },
  delete: { label: "Löschen", icon: Trash2, group: REMOVING, destructive: true },
};

type MenuContext = {
  /** Another action on the page is running. */
  busy: boolean;
  mail: { hasAddress: boolean; mailProgramOpen: boolean };
  /** Marking it paid books the remainder: some of it was paid or credited already. */
  settlesRemainder: boolean;
  onSelect: (id: InvoiceActionId) => void;
};

const NO_ADDRESS_HINT = "Beim Kunden ist keine E-Mail-Adresse hinterlegt.";

function withMailState(entry: MenuEntry, mail: MenuContext["mail"], busy: boolean): MenuEntry {
  if (mail.mailProgramOpen) return { ...entry, label: "Mail-Programm geöffnet…", disabled: true };
  if (!mail.hasAddress) return { ...entry, hint: NO_ADDRESS_HINT, disabled: true };
  return { ...entry, disabled: busy };
}

export function invoiceMenuEntries(ids: InvoiceActionId[], context: MenuContext): MenuEntry[] {
  return ids.flatMap((id) => {
    const definition = INVOICE_MENU[id];
    if (!definition) return [];
    const entry = { ...definition, id, disabled: context.busy, onSelect: () => context.onSelect(id) };
    if (id === "mark-paid" && context.settlesRemainder) entry.label = "Restbetrag als bezahlt markieren";
    return [id === "send-mail" ? withMailState(entry, context.mail, context.busy) : entry];
  });
}
