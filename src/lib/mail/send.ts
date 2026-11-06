import { invoke } from "@tauri-apps/api/core";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCustomer, loadSettings } from "$lib/db/queries";
import { toast, PERSISTENT_TOAST } from "$lib/ui/toast.svelte";
import { buildMailtoUrl, type MailDraft } from "./mailto";
import { composeMailText, type MailContext, type MailDocumentType } from "./templates";

type MailOutcome =
  | { status: "handedOff" }
  | { status: "cancelled" }
  | { status: "unavailable"; message: string };

/**
 * `handed-off`: the mail program shows a message with the PDF attached.
 * `cancelled`: the user closed that message again.
 * `fallback`: no way to attach the PDF worked, a PDF-less mailto: message was opened instead.
 */
export type MailHandoff = "handed-off" | "cancelled" | "fallback";

export type MailMessage = MailDraft & { attachmentPath: string };

export type DocumentMailFacts = Omit<MailContext, "company">;

/** The customer's current address wins over the one frozen into the document's snapshot. */
export async function resolveCustomerEmail(
  customerId: number,
  snapshotEmail: string | null,
): Promise<string | null> {
  const current = (await getCustomer(customerId))?.email?.trim();
  return current || snapshotEmail?.trim() || null;
}

export async function sendDocumentByMail(
  type: MailDocumentType,
  facts: DocumentMailFacts,
  target: { to: string; attachmentPath: string },
): Promise<MailHandoff> {
  const settings = await loadSettings();
  const text = composeMailText(type, settings, { ...facts, company: settings.companyName });
  return sendByMail({ ...text, ...target });
}

async function sendByMail(message: MailMessage): Promise<MailHandoff> {
  const outcome = await invoke<MailOutcome>("compose_mail", { request: message });
  switch (outcome.status) {
    case "handedOff":
      return "handed-off";
    case "cancelled":
      return "cancelled";
    case "unavailable":
      await openMailtoFallback(message, outcome.message);
      return "fallback";
  }
}

async function openMailtoFallback(message: MailMessage, reason: string): Promise<void> {
  await openUrl(buildMailtoUrl(message));
  await revealItemInDir(message.attachmentPath);
  toast.show("PDF bitte von Hand anhängen", {
    variant: "warning",
    description: `Die E-Mail wurde ohne Anhang geöffnet und der PDF-Ordner angezeigt. Bitte das PDF selbst anhängen. (Grund: ${reason})`,
    duration: PERSISTENT_TOAST,
  });
}
