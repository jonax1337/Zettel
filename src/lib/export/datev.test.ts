import { describe, it, expect } from "vitest";
import {
  buildDatevCsv,
  defaultDatevFilename,
  SKR03,
  SKR04,
  UTF8_BOM,
  type DatevExportOpts,
} from "./datev";

const opts: DatevExportOpts = {
  beraternr: 1001,
  mandantennr: 1,
  wjBeginn: new Date(2026, 0, 1),
  dateFrom: new Date(2026, 0, 1),
  dateTo: new Date(2026, 11, 31),
  sachkontenlaenge: 4,
  bezeichnung: "Zettel Test Export",
  accounts: SKR03,
};

describe("buildDatevCsv (empty)", () => {
  const csv = buildDatevCsv({ invoices: [], expenses: [] }, opts, new Date(2026, 4, 17, 12, 0, 0));

  it("starts with UTF-8 BOM", () => {
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
  });

  it("uses CRLF line endings", () => {
    expect(csv).toContain("\r\n");
    expect(csv).not.toMatch(/[^\r]\n/);
  });

  it("emits exactly the header and column lines when no bookings", () => {
    const lines = csv.replace(UTF8_BOM, "").split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it("header line starts with EXTF marker", () => {
    const firstLine = csv.replace(UTF8_BOM, "").split("\r\n")[0];
    expect(firstLine.startsWith('"EXTF"')).toBe(true);
  });

  it("includes consultant and client numbers in header", () => {
    expect(csv).toContain(";1001;");
    expect(csv).toContain(";1;");
  });
});

describe("SKR03 vs SKR04 differ", () => {
  it("have distinct revenue accounts", () => {
    expect(SKR03.revenue19).not.toBe(SKR04.revenue19);
  });
});

describe("defaultDatevFilename", () => {
  it("matches the DATEV import convention", () => {
    const name = defaultDatevFilename(new Date(2026, 4, 17, 14, 32));
    expect(name).toMatch(/^EXTF_Buchungsstapel_\d{8}_\d{4}\.csv$/);
    expect(name).toContain("20260517");
  });
});
