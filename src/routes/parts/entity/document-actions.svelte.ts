import { push } from "svelte-spa-router";
import type { SidecarResponse, SidecarSuccess } from "$lib/sidecar/types";
import { toast } from "$lib/ui/toast.svelte";

type DeleteOptions = {
  remove: () => Promise<unknown>;
  deletedLabel: string;
  redirectTo: string;
};

/** Busy/PDF state and the toast-wrapped actions shared by the invoice and offer detail pages. */
export function createDocumentActions({ reload }: { reload: () => Promise<void> }) {
  let busy = $state(false);
  let generating = $state(false);
  let pdfError = $state<string | null>(null);

  async function run(label: string, action: () => Promise<unknown>) {
    busy = true;
    try {
      await action();
      await reload();
      toast.success(label);
    } catch (e) {
      toast.error("Aktion fehlgeschlagen", String(e));
    } finally {
      busy = false;
    }
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
  ) {
    generating = true;
    pdfError = null;
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
    } finally {
      generating = false;
    }
  }

  async function usePdfFile(path: string | null, open: (path: string) => Promise<void>) {
    if (!path) return;
    try {
      await open(path);
    } catch (e) {
      pdfError = String(e);
    }
  }

  return {
    get busy() {
      return busy;
    },
    get generating() {
      return generating;
    },
    get pdfError() {
      return pdfError;
    },
    run,
    remove,
    generatePdf,
    usePdfFile,
  };
}
