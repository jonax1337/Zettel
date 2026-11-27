import { getCurrentWebview } from "@tauri-apps/api/webview";
import { toast } from "$lib/ui";

type FileDropHandlers = {
  /** True while files are dragged over the window, false when they leave or drop. */
  onHover: (over: boolean) => void;
  onDrop: (paths: string[]) => void;
};

/** Listens for files dropped on the window; call it from onMount and return the result as cleanup. */
export function listenForFileDrop({ onHover, onDrop }: FileDropHandlers): () => void {
  let disposed = false;
  let stopListening: (() => void) | undefined;

  getCurrentWebview()
    .onDragDropEvent(({ payload }) => {
      if (payload.type === "over") {
        onHover(true);
      } else if (payload.type === "leave") {
        onHover(false);
      } else if (payload.type === "drop") {
        onHover(false);
        onDrop(payload.paths);
      }
    })
    .then((unlisten) => {
      if (disposed) unlisten();
      else stopListening = unlisten;
    })
    .catch((e) => toast.warning("Drag & Drop nicht verfügbar", String(e)));

  return () => {
    disposed = true;
    stopListening?.();
  };
}
