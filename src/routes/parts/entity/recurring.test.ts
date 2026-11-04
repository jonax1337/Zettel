import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateInvoiceFromRecurring, push, toast } = vi.hoisted(() => ({
  generateInvoiceFromRecurring: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("$lib/db/recurring", () => ({ generateInvoiceFromRecurring }));
vi.mock("svelte-spa-router", () => ({ push }));
vi.mock("$lib/ui", () => ({ toast }));

import { generateInvoiceAndOpen, generatingRecurringIds } from "./recurring";

beforeEach(() => {
  generateInvoiceFromRecurring.mockReset();
  push.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  generatingRecurringIds.clear();
});

describe("generateInvoiceAndOpen", () => {
  it("creates only one invoice when triggered twice while the first is running", async () => {
    let finish: (invoiceId: number) => void = () => {};
    generateInvoiceFromRecurring.mockReturnValue(new Promise<number>((resolve) => (finish = resolve)));

    const first = generateInvoiceAndOpen(3);
    const second = generateInvoiceAndOpen(3);
    expect(generatingRecurringIds.has(3)).toBe(true);
    finish(42);
    await Promise.all([first, second]);

    expect(generateInvoiceFromRecurring).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/invoices/42");
  });

  it("does not block other templates", async () => {
    generateInvoiceFromRecurring.mockResolvedValue(1);

    await Promise.all([generateInvoiceAndOpen(3), generateInvoiceAndOpen(4)]);

    expect(generateInvoiceFromRecurring).toHaveBeenCalledTimes(2);
  });

  it("releases the template after a failure so it can be retried", async () => {
    generateInvoiceFromRecurring.mockRejectedValueOnce(new Error("kaputt")).mockResolvedValueOnce(9);

    await generateInvoiceAndOpen(3);
    expect(toast.error).toHaveBeenCalled();
    expect(generatingRecurringIds.has(3)).toBe(false);

    await generateInvoiceAndOpen(3);
    expect(push).toHaveBeenCalledWith("/invoices/9");
  });
});
