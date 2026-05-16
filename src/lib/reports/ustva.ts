/**
 * UStVA-Vorbereitungs-Aggregation.
 *
 * Liefert die ELSTER-Kennzahlen für die Umsatzsteuer-Voranmeldung als reine
 * Vorbereitungshilfe zum Abtippen. **Kein** ELSTER-Upload, **keine**
 * Steuerberatung — Werte muss der Anwender prüfen.
 *
 * Berücksichtigte Kennzahlen:
 *  - 81: Lieferungen und Leistungen zu 19 % (Netto-Erlöse)
 *  - 86: Lieferungen und Leistungen zu 7 % (Netto-Erlöse)
 *  - 41: Innergemeinschaftliche Lieferungen (steuerfrei, intra_eu — ausgehend)
 *  - 21: Bezug von Reverse-Charge-Leistungen (eingehend, intra_eu)
 *  - 66: Abziehbare Vorsteuer (aus Eingangsrechnungen)
 */
import { select } from "$lib/db/client";

export type Quarter = 1 | 2 | 3 | 4;

export type UstvaRow = {
  kz: string;
  label: string;
  amount: number; // cents
  computedFrom: string;
};

export type UstvaReport = {
  year: number;
  quarter: Quarter;
  dateFrom: number;
  dateTo: number;
  rows: UstvaRow[];
};

export function quarterRange(year: number, quarter: Quarter): { from: number; to: number } {
  const startMonth = (quarter - 1) * 3;
  const from = Math.floor(new Date(year, startMonth, 1).getTime() / 1000);
  const to = Math.floor(new Date(year, startMonth + 3, 1).getTime() / 1000) - 1;
  return { from, to };
}

type RevenueRow = {
  subtotal: number;
  vat_amount: number;
  vat_rate: number;
  is_credit_note: number;
  reverse_charge_type: string | null;
};

type VatGroupRow = {
  vat_rate: number;
  is_credit_note: number;
  reverse_charge_type: string | null;
  net: number;
  vat: number;
};

type ExpenseVatRow = {
  is_reverse_charge: number;
  status: string;
  vat: number;
};

/** Aggregate invoice line items per (vat_rate, reverse_charge_type, is_credit_note). */
async function loadInvoiceGroups(from: number, to: number): Promise<VatGroupRow[]> {
  return await select<VatGroupRow>(
    `SELECT
       ii.vat_rate AS vat_rate,
       i.is_credit_note AS is_credit_note,
       i.reverse_charge_type AS reverse_charge_type,
       SUM(ii.line_total) AS net,
       SUM(CASE
             WHEN i.is_kleinunternehmer = 1 OR i.is_reverse_charge = 1 THEN 0
             ELSE ROUND(ii.line_total * ii.vat_rate / 100.0)
           END) AS vat
     FROM invoices i
     JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE i.status IN ('sent','paid')
       AND i.issue_date >= ? AND i.issue_date <= ?
     GROUP BY ii.vat_rate, i.is_credit_note, i.reverse_charge_type`,
    [from, to],
  );
}

async function loadExpenseTotals(from: number, to: number): Promise<ExpenseVatRow[]> {
  return await select<ExpenseVatRow>(
    `SELECT
       e.is_reverse_charge AS is_reverse_charge,
       e.status AS status,
       SUM(CASE
             WHEN e.is_reverse_charge = 1 THEN 0
             ELSE ROUND(ii.line_total * ii.vat_rate / 100.0)
           END) AS vat
     FROM expenses e
     JOIN expense_items ii ON ii.expense_id = e.id
     WHERE e.status IN ('open','paid')
       AND e.issue_date >= ? AND e.issue_date <= ?
     GROUP BY e.is_reverse_charge, e.status`,
    [from, to],
  );
}

async function loadIntraEuReverseChargeNet(from: number, to: number): Promise<number> {
  // Eingangsrechnungen mit Reverse-Charge — der Netto-Bezug zählt in Kennzahl 21
  // (UStVA §13b — Steuer schuldet der Leistungsempfänger). Steuerlich wird
  // dafür ein fiktiver Vorsteuer-Betrag im selben Atemzug abgezogen, das
  // bilden wir in 66 derzeit NICHT ab (Kompromiss, klar dokumentiert).
  const rows = await select<{ net: number | null }>(
    `SELECT SUM(ii.line_total) AS net
     FROM expenses e
     JOIN expense_items ii ON ii.expense_id = e.id
     WHERE e.status IN ('open','paid')
       AND e.is_reverse_charge = 1
       AND e.issue_date >= ? AND e.issue_date <= ?`,
    [from, to],
  );
  return rows[0]?.net ?? 0;
}

export async function buildUstvaReport(year: number, quarter: Quarter): Promise<UstvaReport> {
  const { from, to } = quarterRange(year, quarter);
  const [invoiceGroups, expenseTotals, intraEuRcNet] = await Promise.all([
    loadInvoiceGroups(from, to),
    loadExpenseTotals(from, to),
    loadIntraEuReverseChargeNet(from, to),
  ]);

  let net19 = 0;
  let net7 = 0;
  let netIntraEuOutgoing = 0;
  for (const g of invoiceGroups) {
    // Stornos zählen negativ.
    const sign = g.is_credit_note === 1 ? -1 : 1;
    const net = g.net * sign;
    if (g.reverse_charge_type === "intra_eu") {
      netIntraEuOutgoing += net;
    } else if (g.vat_rate === 19) {
      net19 += net;
    } else if (g.vat_rate === 7) {
      net7 += net;
    }
    // Reverse-Charge third_country / Kleinunternehmer (vat_rate=0) zählen in
    // keine der hier abgebildeten Kennzahlen.
  }

  let vorsteuer = 0;
  for (const r of expenseTotals) {
    // Stornierte Eingangsrechnungen sind hier nicht enthalten (Filter
    // status IN ('open','paid') im SQL — cancelled fehlt absichtlich).
    if (r.is_reverse_charge === 1) continue;
    vorsteuer += r.vat;
  }

  const rows: UstvaRow[] = [
    {
      kz: "81",
      label: "Lieferungen und Leistungen zu 19 %",
      amount: net19,
      computedFrom: "Rechnungen mit USt-Satz 19 % (Status versandt/bezahlt), Stornos negativ.",
    },
    {
      kz: "86",
      label: "Lieferungen und Leistungen zu 7 %",
      amount: net7,
      computedFrom: "Rechnungen mit USt-Satz 7 % (Status versandt/bezahlt), Stornos negativ.",
    },
    {
      kz: "41",
      label: "Innergemeinschaftliche Lieferungen (steuerfrei)",
      amount: netIntraEuOutgoing,
      computedFrom: "Rechnungen mit Reverse-Charge intra_eu (Netto).",
    },
    {
      kz: "21",
      label: "Reverse-Charge-Bezüge (innergemeinschaftliche Leistung)",
      amount: intraEuRcNet,
      computedFrom: "Eingangsrechnungen mit Reverse-Charge intra_eu (Netto-Bezug).",
    },
    {
      kz: "66",
      label: "Abziehbare Vorsteuer (aus Eingangsrechnungen)",
      amount: vorsteuer,
      computedFrom: "Vorsteuer aus Eingangsrechnungen ohne §13b (Status offen/bezahlt).",
    },
  ];

  return { year, quarter, dateFrom: from, dateTo: to, rows };
}

export function ustvaToCsv(report: UstvaReport): string {
  // Excel-freundliches CSV: UTF-8-BOM, Semikolon, Komma als Dezimaltrenner.
  const lines = ["Kennzahl;Beschreibung;Betrag (EUR);Berechnet aus"];
  for (const r of report.rows) {
    const euros = (r.amount / 100).toFixed(2).replace(".", ",");
    lines.push(
      `${r.kz};${csvEscape(r.label)};${euros};${csvEscape(r.computedFrom)}`,
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function csvEscape(s: string): string {
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
