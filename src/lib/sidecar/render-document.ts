import { invoke } from "@tauri-apps/api/core";
import { execute } from "$lib/db/client";
import type { SidecarResponse, SidecarSuccess } from "./types";

type PdfCommand = "generate_invoice" | "generate_offer" | "generate_reminder";
type PdfPathTable = "offers" | "reminders";

/**
 * Keeps the previous PDF (if any) before the sidecar overwrites it, so every
 * generation stays available as a version (audit trail). A failed archive must
 * never block PDF generation.
 */
async function archivePreviousPdf(outputPath: string): Promise<void> {
  try {
    await invoke("archive_pdf_version", { path: outputPath });
  } catch (error) {
    console.warn(`Could not archive previous PDF version of ${outputPath}:`, error);
  }
}

/** Archives the previous PDF, renders the new one and runs `onRendered` on success. */
export async function renderDocumentPdf(
  command: PdfCommand,
  payload: { outputPath: string },
  onRendered: (response: SidecarSuccess) => Promise<void>,
): Promise<SidecarResponse> {
  await archivePreviousPdf(payload.outputPath);
  const response = await invoke<SidecarResponse>(command, { payload });
  if (response.success) {
    await onRendered(response);
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
