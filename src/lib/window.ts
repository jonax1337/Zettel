import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

export type FormResult<T = unknown> = { saved: true; data: T } | { saved: false };

type SpawnOpts = {
  label: string;
  url: string;
  title: string;
  width: number;
  height: number;
  savedEvent: string;
};

async function spawnForm<T = unknown>(opts: SpawnOpts): Promise<FormResult<T>> {
  const existing = await WebviewWindow.getByLabel(opts.label);
  if (existing) {
    await existing.setFocus();
    return { saved: false };
  }

  const win = new WebviewWindow(opts.label, {
    url: opts.url,
    title: opts.title,
    width: opts.width,
    height: opts.height,
    minWidth: 600,
    minHeight: 500,
    decorations: false,
    resizable: true,
    center: true,
    focus: true,
    parent: "main",
  });

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = (result: FormResult<T>) => {
      if (settled) return;
      settled = true;
      unlistenSaved.then((u) => u());
      unlistenClose.then((u) => u());
      resolve(result);
    };

    const unlistenSaved = listen<T>(opts.savedEvent, (e) => {
      cleanup({ saved: true, data: e.payload });
    });

    const unlistenClose = win.onCloseRequested(() => {
      cleanup({ saved: false });
    });

    win.once("tauri://error", (e) => {
      console.error("Form window error:", e);
      cleanup({ saved: false });
    });
  });
}

export function openCustomerForm(id?: number) {
  const isEdit = typeof id === "number";
  const label = `customer-${isEdit ? id : "new"}`;
  const path = isEdit ? `/customers/${id}` : "/customers/new";
  return spawnForm<{ id: number }>({
    label,
    url: `index.html#${path}?popup=1`,
    title: isEdit ? "Kunde bearbeiten" : "Neuer Kunde",
    width: 720,
    height: 760,
    savedEvent: "customer:saved",
  });
}

export function openInvoiceForm(id?: number) {
  const isEdit = typeof id === "number";
  const label = `invoice-${isEdit ? id : "new"}`;
  const path = isEdit ? `/invoices/${id}/edit` : "/invoices/new";
  return spawnForm<{ id: number }>({
    label,
    url: `index.html#${path}?popup=1`,
    title: isEdit ? "Rechnung bearbeiten" : "Neue Rechnung",
    width: 1100,
    height: 820,
    savedEvent: "invoice:saved",
  });
}

export function isPopupWindow(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  return hash.includes("popup=1");
}

export async function emitSavedAndClose(event: string, payload: unknown) {
  const { emit } = await import("@tauri-apps/api/event");
  await emit(event, payload);
  await getCurrentWindow().close();
}
