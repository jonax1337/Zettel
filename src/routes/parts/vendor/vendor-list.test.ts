import { describe, expect, it } from "vitest";
import type { Vendor } from "$lib/db/schema";
import { withFigures } from "./vendor-list";

const vendor = (id: number) => ({ id, name: `V${id}` }) as Vendor;

describe("withFigures", () => {
  it("adds the figures of a vendor and empty figures for one without expenses", () => {
    const rows = withFigures([vendor(1), vendor(2)], new Map([[1, { grossInPeriod: 500, lastExpenseDate: 42 }]]));

    expect(rows[0]).toMatchObject({ id: 1, grossInPeriod: 500, lastExpenseDate: 42 });
    expect(rows[1]).toMatchObject({ id: 2, grossInPeriod: 0, lastExpenseDate: null });
  });
});
