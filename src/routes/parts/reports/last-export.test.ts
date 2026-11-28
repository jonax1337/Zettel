import { describe, expect, it } from "vitest";
import { lastExportKey, lastExportLabel, loadLastExport, saveLastExport } from "./last-export";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const DAY = new Date(2026, 2, 12, 15, 30).getTime() / 1000;

describe("last export", () => {
  it("is null before the first export", () => {
    expect(loadLastExport(memoryStorage(), "sqlite:zettel.db")).toBeNull();
  });

  it("returns what was saved for the same database", () => {
    const storage = memoryStorage();

    saveLastExport(storage, "sqlite:zettel.db", DAY);

    expect(loadLastExport(storage, "sqlite:zettel.db")).toBe(DAY);
  });

  it("keeps databases apart", () => {
    const storage = memoryStorage();

    saveLastExport(storage, "sqlite:zettel-sandbox.db", DAY);

    expect(loadLastExport(storage, "sqlite:zettel.db")).toBeNull();
  });

  it.each(["", "abc", "-5", "1.5", "0"])("treats the stored value %j as no export", (raw) => {
    expect(loadLastExport(memoryStorage({ [lastExportKey("db")]: raw }), "db")).toBeNull();
  });

  it("survives a storage that throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(loadLastExport(blocked, "db")).toBeNull();
    expect(() => saveLastExport(blocked, "db", DAY)).not.toThrow();
  });

  it("words the date in German", () => {
    expect(lastExportLabel(DAY)).toBe("zuletzt exportiert am 12.3.2026");
  });
});
