import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, execute } = vi.hoisted(() => ({ invoke: vi.fn(), execute: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("$lib/db/client", () => ({ execute }));

import { renderDocumentPdf, storePdfPath } from "./render-document";
import type { SidecarSuccess } from "./types";

const PAYLOAD = { outputPath: "/docs/Angebote/AN-1.pdf" };
const SUCCESS: SidecarSuccess = {
  success: true,
  pdfPath: "/docs/Angebote/AN-1.pdf",
  validationWarnings: [],
  validationErrors: [],
};

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

  describe("putting the previous PDF back", () => {
    const ARCHIVED = "/docs/Angebote/Versionen/AN-1__1700000000.pdf";
    const FAILURE = { success: false, error: { code: "RENDER_FAILED", message: "x", details: "" } };
    const restoreCall = ["restore_pdf_version", { archived: ARCHIVED, path: PAYLOAD.outputPath }];

    function mockCommands(answers: {
      archived: string | null;
      render: () => Promise<unknown>;
      restore?: () => Promise<unknown>;
    }): void {
      invoke.mockImplementation(async (command: string) => {
        if (command === "archive_pdf_version") return answers.archived;
        if (command === "restore_pdf_version") return answers.restore?.() ?? null;
        return answers.render();
      });
    }

    const invokedCommands = () => invoke.mock.calls.map((call) => call[0]);

    it("restores it when the sidecar reports an error", async () => {
      mockCommands({ archived: ARCHIVED, render: async () => FAILURE });

      const response = await renderDocumentPdf("generate_offer", PAYLOAD, async () => {});

      expect(response).toEqual(FAILURE);
      expect(invoke.mock.calls.at(-1)).toEqual(restoreCall);
    });

    it("restores it and passes the error on when the sidecar call throws", async () => {
      mockCommands({
        archived: ARCHIVED,
        render: async () => {
          throw new Error("sidecar crashed");
        },
      });

      await expect(renderDocumentPdf("generate_offer", PAYLOAD, async () => {})).rejects.toThrow(
        "sidecar crashed",
      );
      expect(invoke.mock.calls.at(-1)).toEqual(restoreCall);
    });

    it("still returns the sidecar error when restoring fails", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCommands({
        archived: ARCHIVED,
        render: async () => FAILURE,
        restore: async () => {
          throw new Error("file locked");
        },
      });

      expect(await renderDocumentPdf("generate_offer", PAYLOAD, async () => {})).toEqual(FAILURE);
    });

    it("has nothing to restore when no previous PDF was archived", async () => {
      mockCommands({ archived: null, render: async () => FAILURE });

      await renderDocumentPdf("generate_offer", PAYLOAD, async () => {});

      expect(invokedCommands()).toEqual(["archive_pdf_version", "generate_offer"]);
    });

    it("leaves the archived version alone after a successful render", async () => {
      mockCommands({ archived: ARCHIVED, render: async () => SUCCESS });

      await renderDocumentPdf("generate_offer", PAYLOAD, async () => {});

      expect(invokedCommands()).toEqual(["archive_pdf_version", "generate_offer"]);
    });
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
