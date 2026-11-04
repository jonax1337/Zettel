import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, invoke, execute } = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    invoke: vi.fn(async (command: string) => {
      calls.push(command);
      return command === "snapshot_db_path" ? "/tmp/snapshot.db" : "";
    }),
    execute: vi.fn(async (sql: string) => {
      calls.push(sql);
    }),
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("$lib/db/client", () => ({ execute }));

const { writeBackupZip } = await import("./backup");
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
