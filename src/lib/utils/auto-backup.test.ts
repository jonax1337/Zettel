import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  saveLastAutoBackupAt: vi.fn(async () => {}),
  saveSettings: vi.fn(async () => {}),
  writeBackupZip: vi.fn(async () => {}),
  invoke: vi.fn(async () => "C:/Dokumente/Zettel/Backups/auto-mon.zip"),
}));

vi.mock("$lib/db/queries", () => ({
  loadSettings: mocks.loadSettings,
  saveLastAutoBackupAt: mocks.saveLastAutoBackupAt,
  saveSettings: mocks.saveSettings,
}));
vi.mock("./backup", () => ({ writeBackupZip: mocks.writeBackupZip }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

const { maybeRunAutoBackup, lastAutoBackupFailure } = await import("./auto-backup");

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const DUE = { autoBackupIntervalDays: 7, lastAutoBackupAt: null, invoiceNumberCounter: 3 };

describe("maybeRunAutoBackup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("stamps only the backup time, never the whole settings row with its counters", async () => {
    mocks.loadSettings.mockResolvedValue(DUE);

    const outcome = await maybeRunAutoBackup();

    expect(outcome.status).toBe("ran");
    expect(mocks.saveLastAutoBackupAt).toHaveBeenCalledOnce();
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });

  it("reports a failed backup and remembers it until the next success", async () => {
    mocks.loadSettings.mockResolvedValue(DUE);
    mocks.writeBackupZip.mockRejectedValueOnce(new Error("Datenträger voll"));

    const failed = await maybeRunAutoBackup();

    expect(failed).toEqual({ status: "failed", message: "Error: Datenträger voll" });
    expect(mocks.saveLastAutoBackupAt).not.toHaveBeenCalled();
    expect(lastAutoBackupFailure()?.message).toBe("Error: Datenträger voll");

    await maybeRunAutoBackup();

    expect(lastAutoBackupFailure()).toBeNull();
  });

  it("skips when auto-backup is switched off", async () => {
    mocks.loadSettings.mockResolvedValue({ ...DUE, autoBackupIntervalDays: 0 });

    const outcome = await maybeRunAutoBackup();

    expect(outcome.status).toBe("skipped");
    expect(mocks.writeBackupZip).not.toHaveBeenCalled();
  });
});
