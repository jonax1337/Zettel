import { errorMessage } from "$lib/utils/error-message";
import { toast } from "$lib/ui/toast.svelte";
import { COMPANY_INCOMPLETE_CODE } from "$lib/sidecar/company-guard";
import { openPreviewPdf } from "$lib/sidecar/pdf-preview";
import type { SidecarResponse } from "$lib/sidecar/types";
import { companySettingsRoute } from "$lib/utils/company-completeness";
import { notifyCompanyIncomplete } from "$lib/utils/company-guard";
import type { createDocumentActions } from "../../parts/entity/document-actions.svelte";

type Actions = Pick<ReturnType<typeof createDocumentActions>, "busy" | "exclusive">;

const PREVIEW_NOTE = "Nur eine Vorschau: Es wurde nichts ausgestellt, gespeichert oder archiviert.";
const MISSING_SEPARATOR = ", ";

/**
 * Renders and opens the draft PDF; every way it can fail is reported, none is thrown.
 * Incomplete company data is reported like before issuing, with the way to the settings.
 */
export async function showPdfPreview(render: () => Promise<SidecarResponse>): Promise<void> {
  let response: SidecarResponse;
  try {
    response = await render();
  } catch (e) {
    toast.error("PDF-Vorschau fehlgeschlagen", errorMessage(e));
    return;
  }
  if (!response.success) {
    reportFailure(response.error);
    return;
  }
  try {
    await openPreviewPdf(response.pdfPath);
  } catch (e) {
    toast.error("Die Vorschau konnte nicht geöffnet werden", errorMessage(e));
    return;
  }
  toast.show("PDF-Vorschau geöffnet", { description: PREVIEW_NOTE });
}

function reportFailure(error: { code: string; message: string; details: string }): void {
  if (error.code === COMPANY_INCOMPLETE_CODE) {
    notifyCompanyIncomplete(error.message, companySettingsRoute(error.details.split(MISSING_SEPARATOR)));
    return;
  }
  toast.error("PDF-Vorschau fehlgeschlagen", error.message);
}

/** The preview of a detail page: one task at a time like the other actions, the page shows it as `actions.previewing`. */
export async function runPdfPreview(actions: Actions, render: () => Promise<SidecarResponse>): Promise<void> {
  if (actions.busy) return;
  await actions.exclusive("preview", () => showPdfPreview(render));
}
