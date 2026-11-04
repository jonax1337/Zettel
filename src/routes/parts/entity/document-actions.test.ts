import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, toast } = vi.hoisted(() => ({
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("svelte-spa-router", () => ({ push }));
vi.mock("$lib/ui/toast.svelte", () => ({ toast }));

import type { SidecarResponse } from "$lib/sidecar/types";
import { createDocumentActions } from "./document-actions.svelte";

const created: SidecarResponse = {
  success: true,
  pdfPath: "/docs/RE-1.pdf",
  validationWarnings: [],
  validationErrors: [],
};
const failed: SidecarResponse = {
  success: false,
  error: { code: "PDF_FAILED", message: "kaputt", details: "" },
};

describe("createDocumentActions", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("run", () => {
    it("reloads and announces success, with busy only while running", async () => {
      const reload = vi.fn().mockResolvedValue(undefined);
      const actions = createDocumentActions({ reload });
      let busyDuringAction = false;

      await actions.run("Erledigt", async () => {
        busyDuringAction = actions.busy;
      });

      expect(busyDuringAction).toBe(true);
      expect(actions.busy).toBe(false);
      expect(reload).toHaveBeenCalledOnce();
      expect(toast.success).toHaveBeenCalledWith("Erledigt");
    });

    it("skips the reload and reports the error when the action fails", async () => {
      const reload = vi.fn();
      const actions = createDocumentActions({ reload });

      await actions.run("Erledigt", () => Promise.reject(new Error("boom")));

      expect(reload).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("Aktion fehlgeschlagen", "Error: boom");
      expect(actions.busy).toBe(false);
    });
  });

  describe("exclusive", () => {
    it("ignores a second task while one is still running", async () => {
      const actions = createDocumentActions({ reload: vi.fn().mockResolvedValue(undefined) });
      let release!: () => void;
      const first = actions.exclusive("validate", () => new Promise<void>((resolve) => (release = resolve)));
      const second = vi.fn();

      await actions.run("Erledigt", second);
      expect(actions.task).toBe("validate");
      release();
      await first;

      expect(second).not.toHaveBeenCalled();
      expect(actions.busy).toBe(false);
    });
  });

  describe("remove", () => {
    it("navigates to the list after deleting", async () => {
      const actions = createDocumentActions({ reload: vi.fn() });

      await actions.remove({ remove: async () => {}, deletedLabel: "Rechnung gelöscht", redirectTo: "/invoices" });

      expect(toast.success).toHaveBeenCalledWith("Rechnung gelöscht");
      expect(push).toHaveBeenCalledWith("/invoices");
    });

    it("stays on the page when deleting fails", async () => {
      const actions = createDocumentActions({ reload: vi.fn() });

      await actions.remove({
        remove: () => Promise.reject(new Error("fk")),
        deletedLabel: "Angebot gelöscht",
        redirectTo: "/offers",
      });

      expect(push).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("Löschen fehlgeschlagen", "Error: fk");
    });
  });

  describe("generatePdf", () => {
    it("hands a created PDF to the page and clears the error", async () => {
      const actions = createDocumentActions({ reload: vi.fn() });
      const onCreated = vi.fn().mockResolvedValue(undefined);

      await actions.generatePdf(async () => created, onCreated);

      expect(onCreated).toHaveBeenCalledWith(created);
      expect(actions.pdfError).toBeNull();
      expect(actions.generating).toBe(false);
    });

    it("exposes the sidecar error code and message", async () => {
      const actions = createDocumentActions({ reload: vi.fn() });
      const onCreated = vi.fn();

      await actions.generatePdf(async () => failed, onCreated);

      expect(onCreated).not.toHaveBeenCalled();
      expect(actions.pdfError).toBe("PDF_FAILED: kaputt");
      expect(toast.error).toHaveBeenCalledWith("PDF-Generierung fehlgeschlagen", "kaputt");
    });

    it("turns a throwing follow-up step into a PDF error", async () => {
      const actions = createDocumentActions({ reload: vi.fn() });

      await actions.generatePdf(async () => created, () => Promise.reject(new Error("open failed")));

      expect(actions.pdfError).toBe("Error: open failed");
      expect(actions.generating).toBe(false);
    });

    it("runs the preparation first and skips the PDF when it fails", async () => {
      const actions = createDocumentActions({ reload: vi.fn() });
      const generate = vi.fn();

      await actions.generatePdf(generate, vi.fn(), {
        run: () => Promise.reject(new Error("claimed")),
        failureTitle: "Festschreiben fehlgeschlagen",
      });

      expect(generate).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("Festschreiben fehlgeschlagen", "Error: claimed");
      expect(actions.generating).toBe(false);
    });

    it("resets an earlier error on the next attempt", async () => {
      const actions = createDocumentActions({ reload: vi.fn() });
      await actions.generatePdf(async () => failed, vi.fn());

      await actions.generatePdf(async () => created, vi.fn().mockResolvedValue(undefined));

      expect(actions.pdfError).toBeNull();
    });
  });

  describe("usePdfFile", () => {
    it("does nothing without a PDF path", async () => {
      const actions = createDocumentActions({ reload: vi.fn() });
      const open = vi.fn();

      await actions.usePdfFile(null, open);

      expect(open).not.toHaveBeenCalled();
    });

    it("reports a failure to open as its own error, not as a failed PDF generation", async () => {
      const actions = createDocumentActions({ reload: vi.fn() });
      const open = vi.fn().mockRejectedValue(new Error("Not allowed to open path"));

      await actions.usePdfFile("/docs/RE-1.pdf", open);

      expect(open).toHaveBeenCalledWith("/docs/RE-1.pdf");
      expect(toast.error).toHaveBeenCalledWith(
        "PDF konnte nicht geöffnet werden",
        "Error: Not allowed to open path",
      );
      expect(actions.pdfError).toBeNull();
    });
  });
});
