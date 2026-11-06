import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn(async () => "C:/Users/x/OneDrive/Dokumente/Zettel-Sandbox"));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts: string[]) => parts.join("/"),
}));

const { companyContactPayload, customerPayload, documentOutputPath } = await import("./payload");

describe("documentOutputPath", () => {
  it("places the PDF below the documents root the backend reports", async () => {
    const path = await documentOutputPath("Mahnungen", "MA-2026-0001");

    expect(invoke).toHaveBeenCalledWith("get_documents_root");
    expect(path).toBe("C:/Users/x/OneDrive/Dokumente/Zettel-Sandbox/Mahnungen/MA-2026-0001.pdf");
  });

  it("replaces characters that are not allowed in file names", async () => {
    const path = await documentOutputPath("Rechnungen", "RE/2026:1");

    expect(path).toMatch(/\/Rechnungen\/RE_2026_1\.pdf$/);
  });
});

describe("contact payload", () => {
  it("trims owner name, e-mail and phone, so the XML carries what the pre-check accepted", () => {
    const company = { ownerName: " Jonas Laux ", email: " rechnung@laux.digital ", phone: " +49 30 1234567 " };

    expect(companyContactPayload(company as never)).toMatchObject({
      ownerName: "Jonas Laux",
      email: "rechnung@laux.digital",
      phone: "+49 30 1234567",
    });
  });

  it("keeps a missing phone number missing", () => {
    expect(companyContactPayload({ ownerName: "A", email: "a@b.de", phone: null } as never).phone).toBeNull();
  });

  it("trims the customer e-mail", () => {
    expect(customerPayload({ email: " amt@bfb.de " } as never).email).toBe("amt@bfb.de");
    expect(customerPayload({ email: null } as never).email).toBeNull();
  });
});
