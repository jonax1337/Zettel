import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn<(command: string, args: { request: { body: string } }) => Promise<unknown>>(),
  openUrl: vi.fn<(url: string) => Promise<void>>(async () => {}),
  revealItemInDir: vi.fn<(path: string) => Promise<void>>(async () => {}),
  getCustomer: vi.fn(),
  loadSettings: vi.fn(),
  show: vi.fn<(title: string, options?: { variant?: string; description?: string; duration?: number }) => void>(),
  error: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocks.openUrl,
  revealItemInDir: mocks.revealItemInDir,
}));
vi.mock("$lib/db/queries", () => ({
  getCustomer: mocks.getCustomer,
  loadSettings: mocks.loadSettings,
}));
vi.mock("$lib/ui/toast.svelte", () => ({
  toast: { show: mocks.show, error: mocks.error },
  PERSISTENT_TOAST: 0,
}));

import { resolveCustomerEmail, sendDocumentByMail } from "./send";

const FACTS = {
  number: "RE-2026-0001",
  totalCent: 11_900,
  currency: "EUR",
  dueDate: Date.UTC(2026, 11, 1, 12) / 1000,
  customer: "Beispiel GmbH",
};
const TARGET = { to: "kunde@example.com", attachmentPath: "C:\\Zettel\\Rechnungen\\RE-2026-0001.pdf" };

const NO_CUSTOM_TEMPLATES = {
  companyName: "Muster Design",
  mailInvoiceSubject: null,
  mailInvoiceBody: null,
  mailOfferSubject: null,
  mailOfferBody: null,
  mailReminderSubject: null,
  mailReminderBody: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSettings.mockResolvedValue(NO_CUSTOM_TEMPLATES);
});

describe("sendDocumentByMail", () => {
  it("passes recipient, filled-in text and PDF path to the native command", async () => {
    mocks.invoke.mockResolvedValue({ status: "handedOff" });

    const result = await sendDocumentByMail("invoice", FACTS, TARGET);

    expect(result).toBe("handed-off");
    expect(mocks.invoke).toHaveBeenCalledWith("compose_mail", {
      request: expect.objectContaining({
        to: "kunde@example.com",
        subject: "Rechnung RE-2026-0001",
        attachmentPath: TARGET.attachmentPath,
      }),
    });
    expect(mocks.invoke.mock.calls[0][1]?.request.body).toContain("Muster Design");
    expect(mocks.openUrl).not.toHaveBeenCalled();
  });

  it("reports a closed compose window without any fallback", async () => {
    mocks.invoke.mockResolvedValue({ status: "cancelled" });

    expect(await sendDocumentByMail("offer", FACTS, TARGET)).toBe("cancelled");
    expect(mocks.openUrl).not.toHaveBeenCalled();
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it("opens a mailto: message, shows the PDF folder and explains it when no client works", async () => {
    mocks.invoke.mockResolvedValue({ status: "unavailable", message: "kein MAPI-Client" });

    const result = await sendDocumentByMail("invoice", FACTS, TARGET);

    expect(result).toBe("fallback");
    const [url] = mocks.openUrl.mock.calls[0];
    expect(url).toMatch(/^mailto:kunde@example\.com\?subject=Rechnung%20RE-2026-0001&body=/);
    expect(mocks.revealItemInDir).toHaveBeenCalledWith(TARGET.attachmentPath);
    expect(mocks.show).toHaveBeenCalledWith(
      "PDF bitte von Hand anhängen",
      expect.objectContaining({ variant: "warning", description: expect.stringContaining("kein MAPI-Client") }),
    );
  });

  it("still shows the folder and explains the missing mail handler when openUrl fails", async () => {
    mocks.invoke.mockResolvedValue({ status: "unavailable", message: "kein MAPI-Client" });
    mocks.openUrl.mockRejectedValueOnce("Kein Handler für mailto");

    const result = await sendDocumentByMail("invoice", FACTS, TARGET);

    expect(result).toBe("fallback");
    expect(mocks.revealItemInDir).toHaveBeenCalledWith(TARGET.attachmentPath);
    const [title, options] = mocks.show.mock.calls[0];
    expect(title).toBe("E-Mail konnte nicht geöffnet werden");
    expect(options).toMatchObject({ variant: "error" });
    expect(options?.description).toContain("Kein Handler für mailto");
    expect(options?.description).toContain(TARGET.to);
    expect(options?.description).toContain("Der PDF-Ordner wird angezeigt");
  });

  it("still opens the message and names the PDF path when the folder cannot be shown", async () => {
    mocks.invoke.mockResolvedValue({ status: "unavailable", message: "kein MAPI-Client" });
    mocks.revealItemInDir.mockRejectedValueOnce("Explorer nicht verfügbar");

    const result = await sendDocumentByMail("invoice", FACTS, TARGET);

    expect(result).toBe("fallback");
    expect(mocks.openUrl).toHaveBeenCalledTimes(1);
    const [title, options] = mocks.show.mock.calls[0];
    expect(title).toBe("PDF bitte von Hand anhängen");
    expect(options?.description).toContain("Die E-Mail wurde ohne Anhang geöffnet");
    expect(options?.description).toContain("Explorer nicht verfügbar");
    expect(options?.description).toContain(TARGET.attachmentPath);
  });

  it("reports both failures when neither the message nor the folder can be opened", async () => {
    mocks.invoke.mockResolvedValue({ status: "unavailable", message: "kein MAPI-Client" });
    mocks.openUrl.mockRejectedValueOnce("kein Handler");
    mocks.revealItemInDir.mockRejectedValueOnce("kein Explorer");

    await sendDocumentByMail("invoice", FACTS, TARGET);

    const [, options] = mocks.show.mock.calls[0];
    expect(options?.description).toContain("kein Handler");
    expect(options?.description).toContain("kein Explorer");
  });

  it("sends a credit note with the credit note text, not the invoice payment request", async () => {
    mocks.invoke.mockResolvedValue({ status: "handedOff" });

    await sendDocumentByMail(
      "creditNote",
      { ...FACTS, number: "RE-2026-0002", totalCent: -11_900, correctsInvoiceNumber: "RE-2026-0001" },
      TARGET,
    );

    const { subject, body } = mocks.invoke.mock.calls[0][1]!.request as { subject: string; body: string };
    expect(subject).toBe("Stornorechnung RE-2026-0002");
    expect(body).toContain("zur Rechnung RE-2026-0001");
    expect(body).not.toContain("überweisen");
  });

  it("lets a failing native command surface to the caller", async () => {
    mocks.invoke.mockRejectedValue("Anhang nicht gefunden");

    await expect(sendDocumentByMail("invoice", FACTS, TARGET)).rejects.toBe("Anhang nicht gefunden");
    expect(mocks.openUrl).not.toHaveBeenCalled();
  });
});

describe("resolveCustomerEmail", () => {
  it("prefers the current customer address", async () => {
    mocks.getCustomer.mockResolvedValue({ email: " neu@example.com " });

    expect(await resolveCustomerEmail(7, "alt@example.com")).toBe("neu@example.com");
  });

  it("falls back to the snapshot when the customer has no address now", async () => {
    mocks.getCustomer.mockResolvedValue({ email: null });

    expect(await resolveCustomerEmail(7, "alt@example.com")).toBe("alt@example.com");
  });

  it("falls back to the snapshot when the customer no longer exists", async () => {
    mocks.getCustomer.mockResolvedValue(null);

    expect(await resolveCustomerEmail(7, "alt@example.com")).toBe("alt@example.com");
  });

  it("reports a failing lookup and falls back to the snapshot", async () => {
    mocks.getCustomer.mockRejectedValue(new Error("db gesperrt"));

    expect(await resolveCustomerEmail(7, " alt@example.com ")).toBe("alt@example.com");
    expect(mocks.error).toHaveBeenCalledWith(
      "Kunden-E-Mail konnte nicht geladen werden",
      "Error: db gesperrt",
    );
  });

  it("is null when neither source has an address", async () => {
    mocks.getCustomer.mockResolvedValue({ email: "  " });

    expect(await resolveCustomerEmail(7, null)).toBeNull();
  });
});
