import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, execute } = vi.hoisted(() => ({ invoke: vi.fn(), execute: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("$lib/db/client", () => ({ execute }));

import { renderDocumentPdf, storePdfPath } from "./render-document";

const PAYLOAD = { outputPath: "/docs/Angebote/AN-1.pdf" };
const SUCCESS = { success: true, pdfPath: "/docs/Angebote/AN-1.pdf", validationWarnings: [], validationErrors: [] };

describe("renderDocumentPdf", () => {
  beforeEach(() => {
    invoke.mockReset();
    execute.mockReset();
  });

  it("archives the previous PDF before the sidecar overwrites it", async () => {
    invoke.mockResolvedValue(SUCCESS);

    await renderDocumentPdf("generate_offer", PAYLOAD, async () => {});

    expect(invoke.mock.calls.map((c) => c[0])).toEqual(["archive_pdf_version", "generate_offer"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "archive_pdf_version", { path: PAYLOAD.outputPath });
    expect(invoke).toHaveBeenNthCalledWith(2, "generate_offer", { payload: PAYLOAD });
  });

  it("still renders when archiving fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    invoke.mockImplementation(async (command: string) => {
      if (command === "archive_pdf_version") throw new Error("disk full");
      return SUCCESS;
    });

    const response = await renderDocumentPdf("generate_reminder", PAYLOAD, async () => {});

    expect(response).toEqual(SUCCESS);
  });

  it("runs the success hook with the response", async () => {
    invoke.mockResolvedValue(SUCCESS);
    const onRendered = vi.fn().mockResolvedValue(undefined);

    await renderDocumentPdf("generate_invoice", PAYLOAD, onRendered);

    expect(onRendered).toHaveBeenCalledWith(SUCCESS);
  });

  it("skips the success hook when the sidecar reports an error", async () => {
    const failure = { success: false, error: { code: "RENDER_FAILED", message: "x", details: "" } };
    invoke.mockImplementation(async (command: string) =>
      command === "archive_pdf_version" ? null : failure,
    );
    const onRendered = vi.fn();

    const response = await renderDocumentPdf("generate_offer", PAYLOAD, onRendered);

    expect(response).toEqual(failure);
    expect(onRendered).not.toHaveBeenCalled();
  });
});

describe("storePdfPath", () => {
  beforeEach(() => execute.mockReset());

  it.each(["offers", "reminders"] as const)("updates the pdf_path of a %s row", async (table) => {
    await storePdfPath(table, 7)(SUCCESS);

    expect(execute).toHaveBeenCalledWith(
      `UPDATE ${table} SET pdf_path = ?, updated_at = unixepoch() WHERE id = ?`,
      [SUCCESS.pdfPath, 7],
    );
  });
});
