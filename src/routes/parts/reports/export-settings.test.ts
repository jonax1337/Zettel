import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DATEV_EXPORT_SETTINGS,
  loadDatevExportSettings,
  parseDatevExportSettings,
  saveDatevExportSettings,
} from "./export-settings";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("parseDatevExportSettings", () => {
  it("returns the defaults for missing or unparsable data", () => {
    expect(parseDatevExportSettings(null)).toEqual(DEFAULT_DATEV_EXPORT_SETTINGS);
    expect(parseDatevExportSettings("{not json")).toEqual(DEFAULT_DATEV_EXPORT_SETTINGS);
    expect(parseDatevExportSettings("42")).toEqual(DEFAULT_DATEV_EXPORT_SETTINGS);
  });

  it("keeps valid fields and falls back per field for the rest", () => {
    expect(
      parseDatevExportSettings(JSON.stringify({ beraternr: 4711, mandantennr: "x", bezeichnung: " Laux " })),
    ).toEqual({ beraternr: 4711, mandantennr: 1, bezeichnung: "Laux" });
  });

  it("rejects non-positive and fractional numbers and caps the label at 30 characters", () => {
    const parsed = parseDatevExportSettings(
      JSON.stringify({ beraternr: 0, mandantennr: 2.5, bezeichnung: "x".repeat(40) }),
    );
    expect(parsed.beraternr).toBe(DEFAULT_DATEV_EXPORT_SETTINGS.beraternr);
    expect(parsed.mandantennr).toBe(DEFAULT_DATEV_EXPORT_SETTINGS.mandantennr);
    expect(parsed.bezeichnung).toHaveLength(30);
  });
});

describe("saveDatevExportSettings / loadDatevExportSettings", () => {
  it("round-trips through storage", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    saveDatevExportSettings({ beraternr: 4711, mandantennr: 12, bezeichnung: "Laux 2026" });
    expect(loadDatevExportSettings()).toEqual({ beraternr: 4711, mandantennr: 12, bezeichnung: "Laux 2026" });
  });

  it("does not overwrite stored values with half-typed input", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    saveDatevExportSettings({ beraternr: 4711, mandantennr: 12, bezeichnung: "Laux" });
    saveDatevExportSettings({ beraternr: null, mandantennr: 12, bezeichnung: "Laux" });
    saveDatevExportSettings({ beraternr: 4711, mandantennr: 12, bezeichnung: "  " });
    expect(loadDatevExportSettings().beraternr).toBe(4711);
    expect(loadDatevExportSettings().bezeichnung).toBe("Laux");
  });

  it("works without usable storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => saveDatevExportSettings({ beraternr: 1, mandantennr: 1, bezeichnung: "x" })).not.toThrow();
    expect(loadDatevExportSettings()).toEqual(DEFAULT_DATEV_EXPORT_SETTINGS);
  });
});
