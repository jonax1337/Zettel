import { describe, expect, it } from "vitest";
import { customerDocuments, filterDocuments, kindLabel } from "./customer-documents";

const NOW = 1_800_000_000;
const DAY = 86_400;

function invoice(overrides: Partial<Parameters<typeof customerDocuments>[0][number]> = {}) {
  return {
    id: 1,
    number: "RE-2026-0001",
    status: "sent" as const,
    issueDate: NOW - 40 * DAY,
    dueDate: NOW + 10 * DAY,
    total: 11_900,
    currency: "EUR",
    isCreditNote: false,
    amountPaidCent: 0,
    settledByCreditNote: false,
    ...overrides,
  };
}

function offer(overrides: Partial<Parameters<typeof customerDocuments>[1][number]> = {}) {
  return { id: 1, number: "AN-2026-0001", status: "sent" as const, issueDate: NOW - 30 * DAY, total: 5_000, currency: "EUR", ...overrides };
}

describe("customerDocuments", () => {
  it("merges invoices and offers, newest first", () => {
    const documents = customerDocuments(
      [invoice({ id: 1, issueDate: NOW - 40 * DAY }), invoice({ id: 2, number: "RE-2", issueDate: NOW - 10 * DAY })],
      [offer({ issueDate: NOW - 20 * DAY })],
      NOW,
    );

    expect(documents.map((d) => d.number)).toEqual(["RE-2", "AN-2026-0001", "RE-2026-0001"]);
  });

  it("orders documents of the same day by id, the later one first", () => {
    const documents = customerDocuments(
      [invoice({ id: 1, number: "RE-1" }), invoice({ id: 2, number: "RE-2" })],
      [],
      NOW,
    );

    expect(documents.map((d) => d.number)).toEqual(["RE-2", "RE-1"]);
  });

  it("links to the document and keeps credit notes negative", () => {
    const [credit, offered] = customerDocuments(
      [invoice({ id: 7, isCreditNote: true, total: -11_900, issueDate: NOW })],
      [offer({ id: 3 })],
      NOW,
    );

    expect(credit).toMatchObject({ href: "/invoices/7", total: -11_900 });
    expect(offered).toMatchObject({ href: "/offers/3", kind: "offer" });
  });

  it("masks the placeholder number of a draft", () => {
    const [draft] = customerDocuments([invoice({ number: "DRAFT-a1b2c3d4e5f6", status: "draft" })], [], NOW);

    expect(draft.number).toMatch(/^Entwurf #/);
  });

  it("keeps the currency of each document", () => {
    const [dollars] = customerDocuments([invoice({ currency: "USD" })], [], NOW);

    expect(dollars.currency).toBe("USD");
  });

  it("counts the days past due only for an open invoice", () => {
    const late = invoice({ id: 1, dueDate: NOW - 5 * DAY });
    const paid = invoice({ id: 2, dueDate: NOW - 5 * DAY, status: "paid" });
    const settled = invoice({ id: 3, dueDate: NOW - 5 * DAY, settledByCreditNote: true });
    const documents = customerDocuments([late, paid, settled], [], NOW);

    const daysOverdue = Object.fromEntries(documents.map((d) => [d.id, d.kind === "invoice" ? d.daysOverdue : null]));
    expect(daysOverdue).toEqual({ 1: 5, 2: null, 3: null });
  });
});

describe("kindLabel", () => {
  it("tells invoice, credit note and offer apart", () => {
    const documents = customerDocuments([invoice({ id: 1 }), invoice({ id: 2, isCreditNote: true })], [offer()], NOW);

    expect(documents.map(kindLabel).sort()).toEqual(["Angebot", "Rechnung", "Stornorechnung"]);
  });
});

describe("filterDocuments", () => {
  const documents = customerDocuments([invoice()], [offer()], NOW);

  it("returns everything for all", () => {
    expect(filterDocuments(documents, "all")).toHaveLength(2);
  });

  it("returns only invoices or only offers", () => {
    expect(filterDocuments(documents, "invoices").map((d) => d.kind)).toEqual(["invoice"]);
    expect(filterDocuments(documents, "offers").map((d) => d.kind)).toEqual(["offer"]);
  });
});
