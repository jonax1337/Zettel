import type { FollowUpGroup } from "$lib/dashboard/follow-up";
import type { FollowUpItem } from "$lib/dashboard/queries";
import type { DraftSummary } from "$lib/dashboard/overview-queries";
import type { RecurringListRow } from "$lib/db/recurring";
import { formatDuration } from "$lib/time/duration";
import { formatDate, SECONDS_PER_DAY, startOfDayUnix } from "$lib/utils/date";
import { centsToEur } from "$lib/utils/money";
import { pluralize } from "../entity/format";

export type TodoUrgency = "late" | "due" | "calm";

export type TodoAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "generate"; label: string; recurringId: number };

export type TodoItem = {
  id: string;
  urgency: TodoUrgency;
  title: string;
  detail?: string;
  action: TodoAction;
};

export type UnbilledTime = { minutes: number; amountCent: number; projectCount: number };

export type TodoSources = {
  now: number;
  overdue: { count: number; total: number };
  /** Days since the oldest open invoice fell due; null without open invoices. */
  oldestDaysOverdue: number | null;
  dueTemplates: Pick<RecurringListRow, "id" | "name" | "customerName" | "nextDueDate">[];
  expiringOffersCount: number;
  followUps: FollowUpItem[];
  drafts: DraftSummary;
  unbilled: UnbilledTime;
};

const URGENCY_RANK: Record<TodoUrgency, number> = { late: 0, due: 1, calm: 2 };

const FOLLOW_UP_URGENCY: Record<FollowUpGroup, TodoUrgency> = { overdue: "late", today: "due", week: "calm" };

const count = (n: number, singular: string, plural: string) => `${n} ${pluralize(n, singular, plural)}`;

function overdueInvoices({ overdue, oldestDaysOverdue }: TodoSources): TodoItem[] {
  if (overdue.count === 0) return [];
  const oldest =
    oldestDaysOverdue === null
      ? ""
      : oldestDaysOverdue < 1
        ? ", die älteste seit heute"
        : `, die älteste seit ${count(oldestDaysOverdue, "Tag", "Tagen")}`;
  return [
    {
      id: "overdue-invoices",
      urgency: "late",
      title: `${count(overdue.count, "Rechnung", "Rechnungen")} ${overdue.count === 1 ? "ist" : "sind"} überfällig`,
      detail: `${centsToEur(overdue.total)} offen${oldest}`,
      action: { kind: "link", label: "Mahnen", href: "/reminders" },
    },
  ];
}

function dueTemplateTitle(template: TodoSources["dueTemplates"][number], daysUntil: number): string {
  const when =
    daysUntil < 0
      ? `seit ${count(-daysUntil, "Tag", "Tagen")} fällig`
      : daysUntil === 0
        ? "heute fällig"
        : `am ${formatDate(template.nextDueDate)} fällig`;
  return `Serie „${template.name}“ ist ${when}`;
}

function dueTemplates({ dueTemplates: templates, now }: TodoSources): TodoItem[] {
  const today = startOfDayUnix(new Date(now * 1000));
  return templates.map((template) => {
    const daysUntil = Math.round((template.nextDueDate - today) / SECONDS_PER_DAY);
    return {
      id: `recurring-${template.id}`,
      urgency: daysUntil < 0 ? "late" : "due",
      title: dueTemplateTitle(template, daysUntil),
      detail: template.customerName,
      action: { kind: "generate", label: "Jetzt erzeugen", recurringId: template.id },
    };
  });
}

function expiringOffers({ expiringOffersCount }: TodoSources): TodoItem[] {
  if (expiringOffersCount === 0) return [];
  return [
    {
      id: "expiring-offers",
      urgency: "due",
      title: `${count(expiringOffersCount, "Angebot läuft", "Angebote laufen")} bald ab`,
      action: { kind: "link", label: "Angebote ansehen", href: "/offers" },
    },
  ];
}

function followUpItems({ followUps }: TodoSources): TodoItem[] {
  return followUps.map((item) => {
    const when =
      item.group === "today"
        ? "Wiedervorlage heute"
        : item.group === "overdue"
          ? `Wiedervorlage war am ${formatDate(item.followUpDate)}`
          : `Wiedervorlage am ${formatDate(item.followUpDate)}`;
    return {
      id: `follow-up-${item.kind}-${item.id}`,
      urgency: FOLLOW_UP_URGENCY[item.group],
      title: item.title,
      detail: `${item.subtitle} · ${when}`,
      action: { kind: "link", label: "Öffnen", href: item.href },
    };
  });
}

function unbilledTime({ unbilled }: TodoSources): TodoItem[] {
  if (unbilled.minutes === 0) return [];
  return [
    {
      id: "unbilled-time",
      urgency: "calm",
      title: `${formatDuration(unbilled.minutes)} Stunden sind noch nicht abgerechnet`,
      detail: `${count(unbilled.projectCount, "Projekt", "Projekte")}, ${centsToEur(unbilled.amountCent)} netto`,
      action: { kind: "link", label: "Abrechnen", href: "/time" },
    },
  ];
}

function invoiceDrafts({ drafts }: TodoSources): TodoItem[] {
  if (drafts.count === 0) return [];
  const withoutRate =
    drafts.unconvertedCount > 0 ? `, ${drafts.unconvertedCount} ohne Wechselkurs nicht in der Summe` : "";
  return [
    {
      id: "invoice-drafts",
      urgency: "calm",
      title: `${count(drafts.count, "Rechnungsentwurf wartet", "Rechnungsentwürfe warten")}`,
      detail: `zusammen ${centsToEur(drafts.total)}${withoutRate}`,
      action: { kind: "link", label: "Ansehen", href: "/invoices" },
    },
  ];
}

/** What needs doing, most urgent first; only what exists, so an empty list means nothing to do. */
export function buildTodoItems(sources: TodoSources): TodoItem[] {
  return [
    ...overdueInvoices(sources),
    ...dueTemplates(sources),
    ...expiringOffers(sources),
    ...followUpItems(sources),
    ...unbilledTime(sources),
    ...invoiceDrafts(sources),
  ].sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);
}
