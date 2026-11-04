import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn(async () => "C:/Users/x/OneDrive/Dokumente/Zettel-Sandbox"));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts: string[]) => parts.join("/"),
}));

const { documentOutputPath } = await import("./payload");

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
