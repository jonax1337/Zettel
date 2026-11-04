import { push } from "svelte-spa-router";
import type { SidecarResponse, SidecarSuccess } from "$lib/sidecar/types";
import { toast } from "$lib/ui/toast.svelte";

type DeleteOptions = {
  remove: () => Promise<unknown>;
  deletedLabel: string;
  redirectTo: string;
};

export type DocumentTask = "action" | "pdf" | "validate" | "convert" | "credit-note";

/** A step that must succeed before the PDF is generated, e.g. issuing a draft invoice. */
export type PdfPreparation = {
  run: () => Promise<unknown>;
  failureTitle: string;
};

/** Busy/PDF state and the toast-wrapped actions shared by the invoice and offer detail pages. */
export function createDocumentActions({ reload }: { reload: () => Promise<void> }) {
  // One task at a time, so status changes, PDF generation, validation and conversions never overlap.
  let task = $state<DocumentTask | null>(null);
  let pdfError = $state<string | null>(null);

  /** Runs `work` unless another task is still running; a second click is ignored. */
  async function exclusive(next: DocumentTask, work: () => Promise<void>) {
    if (task) return;
    task = next;
    try {
      await work();
    } finally {
      task = null;
    }
  }

  async function run(label: string, action: () => Promise<unknown>) {
    await exclusive("action", async () => {
      try {
        await action();
        await reload();
        toast.success(label);
      } catch (e) {
        toast.error("Aktion fehlgeschlagen", String(e));
      }
    });
  }

  async function remove({ remove: deleteDocument, deletedLabel, redirectTo }: DeleteOptions) {
    try {
      await deleteDocument();
      toast.success(deletedLabel);
      push(redirectTo);
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    }
  }

  async function generatePdf(
    generate: () => Promise<SidecarResponse>,
    onCreated: (created: SidecarSuccess) => Promise<void>,
    prepare?: PdfPreparation,
  ) {
    await exclusive("pdf", async () => {
      pdfError = null;
      if (prepare) {
        try {
          await prepare.run();
        } catch (e) {
          toast.error(prepare.failureTitle, String(e));
          return;
        }
      }
      try {
        const res = await generate();
        if (res.success) {
          await onCreated(res);
        } else {
          pdfError = `${res.error.code}: ${res.error.message}`;
          toast.error("PDF-Generierung fehlgeschlagen", res.error.message);
        }
      } catch (e) {
        pdfError = String(e);
        toast.error("PDF-Generierung fehlgeschlagen", String(e));
      }
    });
  }

  async function usePdfFile(path: string | null, open: (path: string) => Promise<void>) {
    if (!path) return;
    try {
      await open(path);
    } catch (e) {
      pdfError = String(e);
    }
  }

  /** For a page that switches to another document: its PDF error does not carry over. */
  function clearPdfError() {
    pdfError = null;
  }

  return {
    get task() {
      return task;
    },
    get busy() {
      return task !== null;
    },
    get generating() {
      return task === "pdf";
    },
    get pdfError() {
      return pdfError;
    },
    exclusive,
    run,
    remove,
    generatePdf,
    usePdfFile,
    clearPdfError,
  };
}
