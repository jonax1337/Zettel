import { describe, expect, it } from "vitest";
import type { FollowUpItem } from "$lib/dashboard/queries";
import { toUnix } from "$lib/utils/date";
import { buildTodoItems, type TodoSources } from "./todo";

const NOW = toUnix(new Date(2026, 10, 27, 12));
const midnight = (month: number, day: number) => toUnix(new Date(2026, month - 1, day));

const NOTHING: TodoSources = {
  now: NOW,
  overdue: { count: 0, total: 0 },
  oldestDaysOverdue: null,
  dueTemplates: [],
  expiringOffersCount: 0,
  followUps: [],
  drafts: { count: 0, total: 0, unconvertedCount: 0 },
  unbilled: { minutes: 0, amountCent: 0, projectCount: 0 },
};

const todo = (overrides: Partial<TodoSources>) => buildTodoItems({ ...NOTHING, ...overrides });
const followUp = (overrides: Partial<FollowUpItem>): FollowUpItem => ({
  kind: "customer",
  id: 1,
  title: "Acme GmbH",
  subtitle: "K-0001",
  followUpDate: midnight(11, 27),
  href: "/customers/1",
  group: "today",
  ...overrides,
});

describe("buildTodoItems", () => {
  it("has nothing to list when there is nothing to do", () => {
    expect(todo({})).toEqual([]);
  });

  it("words overdue invoices with sum and age of the oldest, and leads to the reminders", () => {
    const [item] = todo({ overdue: { count: 3, total: 208_150 }, oldestDaysOverdue: 34 });

    expect(item).toMatchObject({
      urgency: "late",
      title: "3 Rechnungen sind überfällig",
      action: { kind: "link", label: "Mahnen", href: "/reminders" },
    });
    expect(item.detail).toMatch(/^2\.081,50\s€ offen, die älteste seit 34 Tagen$/);
  });

  it("speaks of one invoice in the singular and of a fresh one as overdue since today", () => {
    const [item] = todo({ overdue: { count: 1, total: 1_000 }, oldestDaysOverdue: 0 });

    expect(item.title).toBe("1 Rechnung ist überfällig");
    expect(item.detail).toMatch(/, die älteste seit heute$/);
  });

  it("offers to generate each due template, late when its day has passed", () => {
    const items = todo({
      dueTemplates: [
        { id: 7, name: "Support", customerName: "Nordlicht", nextDueDate: midnight(11, 24) },
        { id: 8, name: "Hosting", customerName: "Atelier Blau", nextDueDate: midnight(11, 27) },
        { id: 9, name: "Pflege", customerName: "Grünwerk", nextDueDate: midnight(12, 4) },
      ],
    });

    expect(items.map((i) => [i.urgency, i.title])).toEqual([
      ["late", "Serie „Support“ ist seit 3 Tagen fällig"],
      ["due", "Serie „Hosting“ ist heute fällig"],
      ["due", "Serie „Pflege“ ist am 4.12.2026 fällig"],
    ]);
    expect(items[0].action).toEqual({ kind: "generate", label: "Jetzt erzeugen", recurringId: 7 });
  });

  it("words expiring offers in singular and plural", () => {
    expect(todo({ expiringOffersCount: 1 })[0].title).toBe("1 Angebot läuft bald ab");
    expect(todo({ expiringOffersCount: 2 })[0].title).toBe("2 Angebote laufen bald ab");
  });

  it("keeps one row per follow-up with its link and rates it by its group", () => {
    const items = todo({
      followUps: [
        followUp({ id: 1, group: "overdue", followUpDate: midnight(11, 20) }),
        followUp({ id: 2, kind: "invoice", title: "RE-2026-0004", subtitle: "Atelier Blau", href: "/invoices/2", group: "week", followUpDate: midnight(12, 1) }),
      ],
    });

    expect(items.map((i) => [i.urgency, i.title, i.detail, i.action])).toEqual([
      ["late", "Acme GmbH", "K-0001 · Wiedervorlage war am 20.11.2026", { kind: "link", label: "Öffnen", href: "/customers/1" }],
      ["calm", "RE-2026-0004", "Atelier Blau · Wiedervorlage am 1.12.2026", { kind: "link", label: "Öffnen", href: "/invoices/2" }],
    ]);
  });

  it("reports unbilled time with hours, projects and net amount", () => {
    const [item] = todo({ unbilled: { minutes: 390, amountCent: 61_750, projectCount: 2 } });

    expect(item).toMatchObject({ urgency: "calm", title: "6:30 Stunden sind noch nicht abgerechnet", action: { href: "/time" } });
    expect(item.detail).toMatch(/^2 Projekte, 617,50\s€ netto$/);
  });

  it("reports drafts, and names drafts that lack an exchange rate", () => {
    const [item] = todo({ drafts: { count: 2, total: 118_603, unconvertedCount: 1 } });

    expect(item.title).toBe("2 Rechnungsentwürfe warten");
    expect(item.detail).toMatch(/^zusammen 1\.186,03\s€, 1 ohne Wechselkurs nicht in der Summe$/);
  });

  it("orders by urgency and keeps the order within one urgency", () => {
    const items = todo({
      drafts: { count: 1, total: 100, unconvertedCount: 0 },
      expiringOffersCount: 1,
      overdue: { count: 1, total: 100 },
      oldestDaysOverdue: 3,
      followUps: [followUp({ group: "today" })],
    });

    expect(items.map((i) => i.id)).toEqual([
      "overdue-invoices",
      "expiring-offers",
      "follow-up-customer-1",
      "invoice-drafts",
    ]);
  });
});
