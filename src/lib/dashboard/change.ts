import { centsToEur } from "$lib/utils/money";

export type Change = {
  direction: "up" | "down" | "same";
  /** Whole percent against the previous value; null when that is zero or negative, where a percentage misleads. */
  percent: number | null;
  differenceCent: number;
};

export function changeBetween(current: number, previous: number): Change {
  const differenceCent = current - previous;
  const direction = differenceCent > 0 ? "up" : differenceCent < 0 ? "down" : "same";
  const percent = previous > 0 ? Math.round((Math.abs(differenceCent) / previous) * 100) : null;
  return { direction, percent: percent === 0 ? null : percent, differenceCent };
}

/** "12 % mehr als im Vorjahreszeitraum" */
export function describeChange(change: Change): string {
  if (change.direction === "same") return "Genauso viel wie im Vorjahreszeitraum";
  const comparison = change.direction === "up" ? "mehr" : "weniger";
  const amount = change.percent === null ? centsToEur(Math.abs(change.differenceCent)) : `${change.percent} %`;
  return `${amount} ${comparison} als im Vorjahreszeitraum`;
}
