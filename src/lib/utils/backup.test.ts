import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, invoke, execute } = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    invoke: vi.fn(async (command: string) => {
      calls.push(command);
      if (command === "snapshot_db_path") return "/tmp/snapshot.db";
      if (command === "auto_backup_target") return "/docs/Zettel/Backups/target.zip";
      return "";
    }),
    execute: vi.fn(async (sql: string) => {
      calls.push(sql);
    }),
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("$lib/db/client", () => ({ execute }));

const { backupTimestamp, writeBackupZip, writeSafetyBackup } = await import("./backup");
const { CURRENT_DB_SCHEMA_VERSION } = await import("./schema-version");

describe("writeBackupZip", () => {
  beforeEach(() => {
    calls.length = 0;
    invoke.mockClear();
    execute.mockClear();
  });

  it("snapshots the database before bundling it", async () => {
    await writeBackupZip("/backups/out.zip", null);

    expect(calls).toEqual(["snapshot_db_path", "VACUUM INTO ?", "bundle_backup"]);
    expect(execute).toHaveBeenCalledWith("VACUUM INTO ?", ["/tmp/snapshot.db"]);
  });

  it("passes the target, schema version and password to the bundler", async () => {
    await writeBackupZip("/backups/out.zip", "geheim");

    expect(invoke).toHaveBeenCalledWith("bundle_backup", {
      snapshotPath: "/tmp/snapshot.db",
      targetZip: "/backups/out.zip",
      invoiceCount: null,
      dbSchemaVersion: CURRENT_DB_SCHEMA_VERSION,
      password: "geheim",
    });
  });
});

describe("writeSafetyBackup", () => {
  beforeEach(() => {
    calls.length = 0;
    invoke.mockClear();
  });

  it("writes an unencrypted backup named after the prefix and time into the backup folder", async () => {
    const path = await writeSafetyBackup("pre-restore", new Date("2026-05-04T13:45:09.123Z"));

    expect(invoke).toHaveBeenCalledWith("auto_backup_target", {
      filename: "pre-restore-2026-05-04_13-45-09.zip",
    });
    expect(invoke).toHaveBeenCalledWith(
      "bundle_backup",
      expect.objectContaining({ targetZip: "/docs/Zettel/Backups/target.zip", password: null }),
    );
    expect(path).toBe("/docs/Zettel/Backups/target.zip");
  });

  it("formats timestamps that sort and are valid in file names", () => {
    expect(backupTimestamp(new Date("2026-12-31T23:59:59.999Z"))).toBe("2026-12-31_23-59-59");
  });
});
