import { invoke } from "@tauri-apps/api/core";
import { readSettings } from "$lib/db/queries";
import type { Settings } from "$lib/db/schema";
import type { SidecarResponse } from "./types";

type PreviewKind = "invoice" | "offer";

/**
 * Draft PDF of a document: the host writes it to a file of its own in the app's cache
 * folder and the sidecar marks it as a draft. Nothing is archived, numbered or recorded,
 * so unlike the issued PDF this never goes through `renderDocumentPdf`.
 */
export function renderPreviewPdf(kind: PreviewKind, id: number, payload: object): Promise<SidecarResponse> {
  return invoke<SidecarResponse>("generate_pdf_preview", { kind, id, payload });
}

/** Opens a preview in the system's PDF viewer; the host only opens its own preview files. */
export function openPreviewPdf(path: string): Promise<void> {
  return invoke("open_pdf_preview", { path });
}

export const SETTINGS_MISSING_MESSAGE =
  "Die Einstellungen sind noch nicht angelegt. Bitte zuerst die Firmendaten unter Einstellungen erfassen.";

/** The settings for a preview, which must not write anything: a missing row is reported, not created. */
export async function readSettingsForPreview(): Promise<Settings> {
  const settings = await readSettings();
  if (!settings) throw new Error(SETTINGS_MISSING_MESSAGE);
  return settings;
}
