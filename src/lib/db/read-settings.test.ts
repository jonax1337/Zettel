import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { loadSettings, readSettings } from "./queries";

const database = (): SqliteDatabase => sqlite.current!;
const settingsRows = () => database().prepare("SELECT COUNT(*) AS n FROM settings").all();

beforeEach(() => {
  sqlite.current = migratedDatabase();
  sqlite.beforeExecute = null;
  database().exec("DELETE FROM settings");
});

describe("readSettings", () => {
  it("reports a missing settings row as null and writes nothing", async () => {
    const writes: string[] = [];
    sqlite.beforeExecute = (query) => writes.push(query);

    expect(await readSettings()).toBeNull();

    expect(writes).toEqual([]);
    expect(settingsRows()).toEqual([{ n: 0 }]);
  });

  it("returns what loadSettings returns once the row exists", async () => {
    await loadSettings();
    database().exec("UPDATE settings SET company_name = 'Muster GmbH' WHERE id = 1");

    expect(await readSettings()).toEqual(await loadSettings());
    expect((await readSettings())?.companyName).toBe("Muster GmbH");
  });
});

describe("loadSettings", () => {
  it("still creates the missing row, once", async () => {
    await loadSettings();
    await loadSettings();

    expect(settingsRows()).toEqual([{ n: 1 }]);
  });
});
