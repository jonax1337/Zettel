import { describe, expect, it } from "vitest";
import { openInvoicesHint, paymentDaysLabel, unbilledTimeLabel } from "./customer-figures";

describe("paymentDaysLabel", () => {
  it("takes the dative after \"nach\", singular for one day", () => {
    expect(paymentDaysLabel(1)).toBe("1 Tag");
    expect(paymentDaysLabel(12)).toBe("12 Tagen");
    expect(paymentDaysLabel(0)).toBe("0 Tagen");
  });
});

describe("unbilledTimeLabel", () => {
  it("shows hours and minutes", () => {
    expect(unbilledTimeLabel(270)).toBe("4:30 Std");
    expect(unbilledTimeLabel(0)).toBe("0:00 Std");
  });
});

describe("openInvoicesHint", () => {
  it("counts open invoices and says nothing when there are none", () => {
    expect(openInvoicesHint(0)).toBeUndefined();
    expect(openInvoicesHint(1)).toBe("1 Rechnung");
    expect(openInvoicesHint(3)).toBe("3 Rechnungen");
  });
});
