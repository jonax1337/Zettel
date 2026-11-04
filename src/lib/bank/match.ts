/**
 * Bank-Booking ↔ Invoice-Matching.
 *
 * Strategie (Reihenfolge der Konfidenz):
 *   1. Exakte Rechnungsnummer im Purpose → starker Match
 *   2. Betrags-Match auf offenen Saldo (±0,01 €) + zeitlich plausibel → Match
 *   3. Sonst: Kandidatenliste mit niedrigerer Konfidenz
 *
 * Output ist eine Liste von Bookings mit jeweils 0..n Match-Kandidaten;
 * der User bestätigt im UI.
 */
import type { InvoiceListRow } from "$lib/db/invoices";
import { isDraftNumber } from "$lib/utils/invoice-number";

export type Booking = {
  valutaDate: string; // YYYY-MM-DD
  amountCent: number; // signed (positiv = Geldeingang)
  currency: string;
  partyName: string;
  purpose: string;
  transactionId: string;
};

export type MatchCandidate = {
  invoice: InvoiceListRow;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export type BookingMatch = {
  booking: Booking;
  candidates: MatchCandidate[];
  /** Default-Auswahl (höchste Konfidenz; null wenn keine Kandidaten). */
  defaultPick: number | null;
};

const AMOUNT_TOLERANCE_CENT = 1;
const MIN_PARTY_NAME_LENGTH = 4;
const MIN_CUSTOMER_WORD_LENGTH = 4;

const CONFIDENCE_RANK: Record<MatchCandidate["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function openBalance(inv: Pick<InvoiceListRow, "total" | "amountPaidCent">): number {
  return Math.abs(inv.total) - (inv.amountPaidCent ?? 0);
}

/** Pass 1: Rechnungsnummer im Verwendungszweck. */
function matchByInvoiceNumber(booking: Booking, invoices: InvoiceListRow[]): MatchCandidate[] {
  const purpose = booking.purpose.toLowerCase();
  return invoices
    .filter((inv) => inv.number && !isDraftNumber(inv.number))
    .filter((inv) => new RegExp(`\\b${escapeForRegex(inv.number)}\\b`, "i").test(purpose))
    .map((invoice): MatchCandidate => ({
      invoice,
      confidence: "high",
      reason: `Rechnungsnummer "${invoice.number}" im Verwendungszweck`,
    }));
}

/** Pass 2: Exakter Betrags-Match auf offenen Saldo. */
function matchByOpenBalance(booking: Booking, invoices: InvoiceListRow[]): MatchCandidate[] {
  return invoices
    .filter((inv) => Math.abs(openBalance(inv) - booking.amountCent) <= AMOUNT_TOLERANCE_CENT)
    .map((invoice): MatchCandidate => ({
      invoice,
      confidence: "medium",
      reason: "Betrag matcht offenen Saldo exakt",
    }));
}

/** Pass 3: Ein Wort des Kundennamens kommt im Namen des Zahlers vor. */
function matchByPartyName(booking: Booking, invoices: InvoiceListRow[]): MatchCandidate[] {
  if (booking.partyName.length < MIN_PARTY_NAME_LENGTH) return [];
  const party = booking.partyName.toLowerCase();
  return invoices
    .filter((inv) =>
      inv.customerName
        .toLowerCase()
        .split(/\s+/)
        .some((word) => word.length >= MIN_CUSTOMER_WORD_LENGTH && party.includes(word)),
    )
    .map((invoice): MatchCandidate => ({
      invoice,
      confidence: "low",
      reason: `Kunde "${invoice.customerName}" könnte zum Zahler "${booking.partyName}" passen`,
    }));
}

function matchBooking(booking: Booking, openInvoices: InvoiceListRow[]): BookingMatch {
  // Geldausgänge ignorieren wir komplett — wir matchen nur Forderungs-Eingänge.
  if (booking.amountCent <= 0) {
    return { booking, candidates: [], defaultPick: null };
  }

  const passes = [matchByInvoiceNumber, matchByOpenBalance, matchByPartyName];
  let candidates: MatchCandidate[] = [];
  for (const pass of passes) {
    candidates = pass(booking, openInvoices);
    if (candidates.length > 0) break;
  }

  candidates.sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]);
  return {
    booking,
    candidates,
    defaultPick: candidates.length > 0 && candidates[0].confidence !== "low" ? 0 : null,
  };
}

export function matchBookings(
  bookings: Booking[],
  invoices: InvoiceListRow[],
): BookingMatch[] {
  // Wir interessieren uns nur für offene oder teilbezahlte Rechnungen.
  const openInvoices = invoices.filter(
    (i) => (i.status === "sent" || i.status === "partial") && !i.isCreditNote,
  );
  return bookings.map((booking) => matchBooking(booking, openInvoices));
}
