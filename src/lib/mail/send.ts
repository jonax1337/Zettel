import { invoke } from "@tauri-apps/api/core";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCustomer, loadSettings } from "$lib/db/queries";
import { toast, PERSISTENT_TOAST } from "$lib/ui/toast.svelte";
import { buildMailtoUrl, type MailDraft } from "./mailto";
import { composeMailText, type MailContext, type MailKind } from "./templates";

type MailOutcome =
  | { status: "handedOff" }
  | { status: "cancelled" }
  | { status: "unavailable"; message: string };

/**
 * `handed-off`: the mail program shows a message with the PDF attached.
 * `cancelled`: the user closed that message again.
 * `fallback`: no way to attach the PDF worked, the mailto: fallback ran instead.
 */
export type MailHandoff = "handed-off" | "cancelled" | "fallback";

export type MailMessage = MailDraft & { attachmentPath: string };

export type DocumentMailFacts = Omit<MailContext, "company">;

/**
 * The customer's current address wins over the one frozen into the document's
 * snapshot, which is also the fallback when the lookup fails.
 */
export async function resolveCustomerEmail(
  customerId: number,
  snapshotEmail: string | null,
): Promise<string | null> {
  const fallback = snapshotEmail?.trim() || null;
  try {
    return (await getCustomer(customerId))?.email?.trim() || fallback;
  } catch (e) {
    toast.error("Kunden-E-Mail konnte nicht geladen werden", String(e));
    return fallback;
  }
}

export async function sendDocumentByMail(
  kind: MailKind,
  facts: DocumentMailFacts,
  target: { to: string; attachmentPath: string },
): Promise<MailHandoff> {
  const settings = await loadSettings();
  const text = composeMailText(kind, settings, { ...facts, company: settings.companyName });
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

/** The error text of a failed action, or null when it worked. */
async function failureOf(action: () => Promise<void>): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (e) {
    return String(e);
  }
}

/**
 * Opens the message without attachment and shows the PDF's folder. Each step
 * runs even when the other failed, and the toast says what actually happened.
 */
async function openMailtoFallback(message: MailMessage, reason: string): Promise<void> {
  const mailError = await failureOf(() => openUrl(buildMailtoUrl(message)));
  const folderError = await failureOf(() => revealItemInDir(message.attachmentPath));

  const mailPart = mailError
    ? `Die E-Mail konnte nicht geöffnet werden (${mailError}). Bitte selbst eine E-Mail an ${message.to} erstellen.`
    : "Die E-Mail wurde ohne Anhang geöffnet.";
  const folderPart = folderError
    ? `Der PDF-Ordner konnte nicht geöffnet werden (${folderError}). Das PDF liegt unter ${message.attachmentPath}.`
    : "Der PDF-Ordner wird angezeigt.";

  toast.show(mailError ? "E-Mail konnte nicht geöffnet werden" : "PDF bitte von Hand anhängen", {
    variant: mailError ? "error" : "warning",
    description: `${mailPart} ${folderPart} Bitte das PDF selbst anhängen. (Grund: ${reason})`,
    duration: PERSISTENT_TOAST,
  });
}
