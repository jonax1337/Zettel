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

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openBalance(inv: InvoiceListRow): number {
  return Math.abs(inv.total) - (inv.amountPaidCent ?? 0);
}

export function matchBookings(
  bookings: Booking[],
  invoices: InvoiceListRow[],
): BookingMatch[] {
  // Wir interessieren uns nur für offene oder teilbezahlte Rechnungen.
  const candidates = invoices.filter(
    (i) => (i.status === "sent" || i.status === "partial") && !i.isCreditNote,
  );

  return bookings.map((b) => {
    // Geldausgänge ignorieren wir komplett — wir matchen nur Forderungs-Eingänge.
    if (b.amountCent <= 0) {
      return { booking: b, candidates: [], defaultPick: null };
    }

    const hits: MatchCandidate[] = [];
    const purpose = b.purpose.toLowerCase();

    // Pass 1: Rechnungsnummer im Verwendungszweck.
    for (const inv of candidates) {
      const num = inv.number;
      if (!num || num.startsWith("DRAFT-")) continue;
      const re = new RegExp(`\\b${escapeForRegex(num)}\\b`, "i");
      if (re.test(purpose)) {
        hits.push({
          invoice: inv,
          confidence: "high",
          reason: `Rechnungsnummer "${num}" im Verwendungszweck`,
        });
      }
    }

    // Pass 2: Exakter Betrags-Match auf offenen Saldo.
    if (hits.length === 0) {
      for (const inv of candidates) {
        if (Math.abs(openBalance(inv) - b.amountCent) <= 1) {
          hits.push({
            invoice: inv,
            confidence: "medium",
            reason: "Betrag matcht offenen Saldo exakt",
          });
        }
      }
    }

    // Pass 3: Kunde matcht teilweise auf partyName (Name-Substring).
    if (hits.length === 0 && b.partyName.length > 3) {
      const partyLower = b.partyName.toLowerCase();
      for (const inv of candidates) {
        const cust = inv.customerName.toLowerCase();
        const overlap = cust.split(/\s+/).some((w) => w.length >= 4 && partyLower.includes(w));
        if (overlap) {
          hits.push({
            invoice: inv,
            confidence: "low",
            reason: `Kunde "${inv.customerName}" könnte zum Zahler "${b.partyName}" passen`,
          });
        }
      }
    }

    // Sortiere absteigend nach Konfidenz.
    const order = { high: 3, medium: 2, low: 1 };
    hits.sort((a, b) => order[b.confidence] - order[a.confidence]);

    return {
      booking: b,
      candidates: hits,
      defaultPick: hits.length > 0 && hits[0].confidence !== "low" ? 0 : null,
    };
  });
}
