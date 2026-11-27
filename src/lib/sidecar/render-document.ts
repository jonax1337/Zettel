import { invoke } from "@tauri-apps/api/core";
import { execute } from "$lib/db/client";
import type { SidecarResponse, SidecarSuccess } from "./types";

type PdfCommand = "generate_invoice" | "generate_offer" | "generate_reminder";
type PdfPathTable = "offers" | "reminders";

/**
 * Keeps the previous PDF (if any) before the sidecar overwrites it, so every
 * generation stays available as a version (audit trail). `storedPdfPath` may
 * lie in an older documents root; its chain moves next to `outputPath`. A
 * failed archive must never block PDF generation. Returns where the PDF at
 * `outputPath` was archived, or null if there was none.
 */
async function archivePreviousPdf(
  outputPath: string,
  storedPdfPath?: string | null,
): Promise<string | null> {
  try {
    return await invoke<string | null>("archive_pdf_version", {
      path: outputPath,
      previous: storedPdfPath,
    });
  } catch (error) {
    console.warn(`Could not archive previous PDF version of ${outputPath}:`, error);
    return null;
  }
}

/**
 * Puts the archived PDF back after a failed generation: the document still
 * stores `outputPath`, which would otherwise point at nothing.
 */
async function restoreArchivedPdf(archivedPath: string | null, outputPath: string): Promise<void> {
  if (!archivedPath) return;
  try {
    await invoke("restore_pdf_version", { archived: archivedPath, path: outputPath });
  } catch (error) {
    console.warn(`Could not restore ${outputPath} from ${archivedPath}:`, error);
  }
}

/**
 * Archives the previous PDF, renders the new one and runs `onRendered` on
 * success. A failed render leaves the previous PDF in place.
 */
export async function renderDocumentPdf(
  command: PdfCommand,
  payload: { outputPath: string },
  onRendered: (response: SidecarSuccess) => Promise<void>,
  storedPdfPath?: string | null,
): Promise<SidecarResponse> {
  const archivedPath = await archivePreviousPdf(payload.outputPath, storedPdfPath);
  let response: SidecarResponse;
  try {
    response = await invoke<SidecarResponse>(command, { payload });
  } catch (error) {
    await restoreArchivedPdf(archivedPath, payload.outputPath);
    throw error;
  }
  if (response.success) {
    await onRendered(response);
  } else {
    await restoreArchivedPdf(archivedPath, payload.outputPath);
  }
  return response;
}

export function storePdfPath(
  table: PdfPathTable,
  id: number,
): (response: SidecarSuccess) => Promise<void> {
  return async (response) => {
    await execute(`UPDATE ${table} SET pdf_path = ?, updated_at = unixepoch() WHERE id = ?`, [
      response.pdfPath,
      id,
    ]);
  };
}
