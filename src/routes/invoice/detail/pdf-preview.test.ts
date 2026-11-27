import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ show: vi.fn(), error: vi.fn() }));
vi.mock("$lib/ui/toast.svelte", () => ({ toast }));
const openPreviewPdf = vi.hoisted(() => vi.fn(async (_path: string) => {}));
vi.mock("$lib/sidecar/pdf-preview", () => ({ openPreviewPdf }));
const notifyCompanyIncomplete = vi.hoisted(() => vi.fn());
vi.mock("$lib/utils/company-guard", () => ({ notifyCompanyIncomplete }));

import { COMPANY_INCOMPLETE_CODE } from "$lib/sidecar/company-guard";
import type { SidecarResponse } from "$lib/sidecar/types";
import { runPdfPreview, showPdfPreview } from "./pdf-preview";

const PATH = "C:/cache/pdf-preview/Vorschau-Rechnung-1.pdf";
const rendered = async (): Promise<SidecarResponse> => ({
  success: true,
  pdfPath: PATH,
  validationWarnings: [],
  validationErrors: [],
});

beforeEach(() => {
  toast.show.mockClear();
  toast.error.mockClear();
  notifyCompanyIncomplete.mockClear();
  openPreviewPdf.mockReset();
});

describe("showPdfPreview", () => {
  it("opens the PDF and says that nothing was issued", async () => {
    await showPdfPreview(rendered);

    expect(openPreviewPdf).toHaveBeenCalledWith(PATH);
    expect(toast.show).toHaveBeenCalledWith("PDF-Vorschau geöffnet", {
      description: expect.stringContaining("nichts ausgestellt"),
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports the sidecar's error and opens nothing", async () => {
    await showPdfPreview(async () => ({ success: false, error: { code: "RENDER_FAILED", message: "boom", details: "" } }));

    expect(toast.error).toHaveBeenCalledWith("PDF-Vorschau fehlgeschlagen", "boom");
    expect(openPreviewPdf).not.toHaveBeenCalled();
    expect(toast.show).not.toHaveBeenCalled();
  });

  it("sends incomplete company data to the settings page that holds what is missing", async () => {
    const incomplete = (details: string): SidecarResponse => ({
      success: false,
      error: { code: COMPANY_INCOMPLETE_CODE, message: "Firmendaten fehlen", details },
    });

    await showPdfPreview(async () => incomplete("Steuernummer oder USt-IdNr."));
    await showPdfPreview(async () => incomplete("Firmenname, Anschrift"));

    const routes = notifyCompanyIncomplete.mock.calls.map(([message, route]) => [message, route]);
    expect(routes[0][1]).not.toBe(routes[1][1]);
    expect(routes.map(([message]) => message)).toEqual(["Firmendaten fehlen", "Firmendaten fehlen"]);
    expect(toast.error).not.toHaveBeenCalled();
    expect(openPreviewPdf).not.toHaveBeenCalled();
  });

  it("reports a render that throws", async () => {
    await showPdfPreview(async () => {
      throw new Error("sidecar gone");
    });

    expect(toast.error).toHaveBeenCalledWith("PDF-Vorschau fehlgeschlagen", "sidecar gone");
    expect(openPreviewPdf).not.toHaveBeenCalled();
  });

  it("reports a viewer that cannot be started, without claiming the preview opened", async () => {
    openPreviewPdf.mockRejectedValueOnce(new Error("no viewer"));

    await showPdfPreview(rendered);

    expect(toast.error).toHaveBeenCalledWith("Die Vorschau konnte nicht geöffnet werden", "no viewer");
    expect(toast.show).not.toHaveBeenCalled();
  });
});

describe("runPdfPreview", () => {
  function actions(busy = false) {
    return {
      busy,
      exclusive: vi.fn(async (_task: string, work: () => Promise<void>) => {
        if (!busy) await work();
      }),
    };
  }

  it("runs the preview as the exclusive \"preview\" task", async () => {
    const page = actions();

    await runPdfPreview(page, rendered);

    expect(page.exclusive).toHaveBeenCalledWith("preview", expect.any(Function));
    expect(openPreviewPdf).toHaveBeenCalledWith(PATH);
  });

  it("does nothing while another action runs", async () => {
    const render = vi.fn(rendered);
    const page = actions(true);

    await runPdfPreview(page, render);

    expect(render).not.toHaveBeenCalled();
    expect(page.exclusive).not.toHaveBeenCalled();
  });
});
