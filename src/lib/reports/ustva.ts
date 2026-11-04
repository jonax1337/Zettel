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
 *  - 41: Innergemeinschaftliche Lieferungen (steuerfrei, intra_eu + Lieferung — ausgehend)
 *  - 21: Nicht steuerbare sonstige Leistungen im EU-Ausland (§ 18b S. 1 Nr. 2, intra_eu + Leistung)
 *  - 43: Steuerfreie Ausfuhrlieferungen (§ 4 Nr. 1a, third_country + Lieferung)
 *  - 45: Übrige nicht steuerbare Umsätze (Leistungsort im Drittland, third_country + Leistung)
 *  - 46: §13b-Bezug von Leistungen eines EU-Unternehmers (§ 13b Abs. 1, eingehend)
 *  - 84: §13b-Bezug von Leistungen eines Drittland-Unternehmers (§ 13b Abs. 2 Nr. 1, eingehend)
 *  - 66: Abziehbare Vorsteuer (aus Eingangsrechnungen)
 *
 * Bemessungsgrundlagen (81, 86, 41, 21, 43, 45, 46, 84) sind wie in ELSTER auf volle
 * Euro abgeschnitten, Steuerbeträge (66) behalten die Cent.
 *
 * Für 46/84 wird nur die Bemessungsgrundlage geliefert; die geschuldete Steuer
 * (47/85) und die gleich hohe Vorsteuer (67) ergänzt der Anwender selbst.
 *
 * Bei Ist-Versteuerung (§ 20 UStG) folgen nur 81/86 dem Zahlungseingang. 41, 21
 * (§ 18b S. 2), 43, 45 und die §13b-Bezüge bleiben beim Rechnungsdatum, die
 * Vorsteuer (66) beim Rechnungseingang.
 */
import { periodForQuarter, type Quarter } from "$lib/dashboard/period";
import { select } from "$lib/db/client";
import type { Settings } from "$lib/db/schema";
import { CSV_LINE_BREAK, escapeCsvField, UTF8_BOM } from "$lib/utils/csv";
import { centsToEur } from "$lib/utils/money";
import {
  apportion,
  cashBasisNetByRate,
  eurNetTotal,
  isForeignCurrency,
  loadCashBasisRows,
  type RateNet,
} from "./ustva-cash";

export type { Quarter };

export type VatAccounting = Settings["vatAccounting"];

export const VAT_ACCOUNTING_LABELS: Record<VatAccounting, string> = {
  accrual: "Soll-Versteuerung (nach Rechnungsdatum)",
  cash: "Ist-Versteuerung (nach Zahlungseingang, § 20 UStG)",
};

const STANDARD_VAT_RATE = 19;
const REDUCED_VAT_RATE = 7;

export type UstvaRow = {
  kz: string;
  label: string;
  amount: number; // cents
  /** ELSTER takes Bemessungsgrundlagen as whole euros (truncated); tax amounts carry cents. */
  wholeEuros: boolean;
  computedFrom: string;
};

const CENTS_PER_EURO = 100;

/** Truncates towards zero to whole euros, as ELSTER expects for Bemessungsgrundlagen. */
export function truncateToWholeEuros(cents: number): number {
  return Math.trunc(cents / CENTS_PER_EURO) * CENTS_PER_EURO || 0;
}

function baseRow(kz: string, label: string, cents: number, computedFrom: string): UstvaRow {
  return { kz, label, amount: truncateToWholeEuros(cents), wholeEuros: true, computedFrom };
}

export function formatUstvaAmount(row: UstvaRow): string {
  if (!row.wholeEuros) return centsToEur(row.amount);
  return (row.amount / CENTS_PER_EURO).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

export type UstvaReport = {
  year: number;
  quarter: Quarter;
  dateFrom: number;
  dateTo: number;
  vatAccounting: VatAccounting;
  rows: UstvaRow[];
};

/** Inclusive unix-second range of the quarter. */
function quarterRange(year: number, quarter: Quarter): { from: number; to: number } {
  const { start, end } = periodForQuarter(year, quarter);
  return { from: start, to: end - 1 };
}

/** Net revenue of one (vat_rate, reverse_charge_type, supply_kind, is_credit_note) group, in EUR cents. */
export type VatGroupRow = {
  vat_rate: number;
  is_credit_note: number;
  reverse_charge_type: string | null;
  supply_kind: string;
  net: number;
};

/** One VAT-rate group of an issued invoice; `net` is in the invoice currency (always positive). */
export type InvoiceGroupRow = VatGroupRow & {
  invoice_id: number;
  /** Signed gross total in the invoice currency (credit notes negative). */
  total: number;
  currency: string | null;
  /** Signed frozen EUR gross total; only meaningful for foreign-currency invoices. */
  eur_total_cent: number | null;
};

/** Aggregate invoice line items per invoice and VAT rate, still in the invoice currency. */
async function loadInvoiceGroups(from: number, to: number): Promise<InvoiceGroupRow[]> {
  return await select<InvoiceGroupRow>(
    `SELECT
       i.id AS invoice_id,
       ii.vat_rate AS vat_rate,
       i.is_credit_note AS is_credit_note,
       i.reverse_charge_type AS reverse_charge_type,
       i.supply_kind AS supply_kind,
       i.total AS total,
       i.currency AS currency,
       i.eur_total_cent AS eur_total_cent,
       SUM(ii.line_total) AS net
     FROM invoices i
     JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE i.status IN ('sent','partial','paid')
       AND i.issue_date >= ? AND i.issue_date <= ?
     GROUP BY i.id, ii.vat_rate`,
    [from, to],
  );
}

/**
 * Converts foreign-currency invoices to EUR via their frozen EUR total, like the
 * Ist-Versteuerung and the DATEV export. The invoice's EUR net is split across
 * its VAT-rate groups so they add up to it exactly. EUR invoices pass unchanged.
 */
export function convertGroupsToEur(rows: InvoiceGroupRow[]): VatGroupRow[] {
  const byInvoice = new Map<number, InvoiceGroupRow[]>();
  for (const row of rows) {
    byInvoice.set(row.invoice_id, [...(byInvoice.get(row.invoice_id) ?? []), row]);
  }
  return [...byInvoice.values()].flatMap(eurGroupsOfInvoice);
}

function eurGroupsOfInvoice(groups: InvoiceGroupRow[]): VatGroupRow[] {
  const [first] = groups;
  const grossTotal = Math.abs(first.total);
  if (!isForeignCurrency(first) || grossTotal === 0) return groups;

  const rateNets: RateNet[] = groups.map((g) => ({ rate: g.vat_rate, net: g.net }));
  const eurNets = apportion(rateNets, eurNetTotal(rateNets, grossTotal, Math.abs(first.eur_total_cent)));
  return groups.map((g, i) => ({ ...g, net: eurNets[i] }));
}

/**
 * Vorsteuer aus Eingangsrechnungen ohne Reverse-Charge. Stornierte
 * Eingangsrechnungen fehlen absichtlich (Status-Filter open/paid). Nutzt die beim
 * Speichern berechnete `vat_amount` (Rundung je Position wie in der App); eine
 * SQL-ROUND-Neuberechnung rundet negative Halbcent-Werte von Null weg.
 */
async function loadDeductibleInputVat(from: number, to: number): Promise<number> {
  const rows = await select<{ vat: number | null }>(
    `SELECT SUM(e.vat_amount) AS vat
     FROM expenses e
     WHERE e.status IN ('open','paid')
       AND e.is_reverse_charge = 0
       AND e.issue_date >= ? AND e.issue_date <= ?`,
    [from, to],
  );
  return rows[0]?.vat ?? 0;
}

export type ReverseChargePurchaseRow = {
  reverse_charge_type: string;
  net: number;
};

/** Net purchases from reverse-charge supplier invoices, per reverse_charge_type. */
async function loadReverseChargePurchases(
  from: number,
  to: number,
): Promise<ReverseChargePurchaseRow[]> {
  return await select<ReverseChargePurchaseRow>(
    `SELECT
       e.reverse_charge_type AS reverse_charge_type,
       SUM(ii.line_total) AS net
     FROM expenses e
     JOIN expense_items ii ON ii.expense_id = e.id
     WHERE e.status IN ('open','paid')
       AND e.is_reverse_charge = 1
       AND e.issue_date >= ? AND e.issue_date <= ?
     GROUP BY e.reverse_charge_type`,
    [from, to],
  );
}

type ReverseChargePurchaseNet = { netIntraEu: number; netThirdCountry: number };

/** Splits §13b purchases by the supplier's seat: EU → Kennzahl 46, third country → Kennzahl 84. */
export function sumReverseChargePurchases(
  rows: ReverseChargePurchaseRow[],
): ReverseChargePurchaseNet {
  const sums: ReverseChargePurchaseNet = { netIntraEu: 0, netThirdCountry: 0 };
  for (const r of rows) {
    if (r.reverse_charge_type === "intra_eu") {
      sums.netIntraEu += r.net;
    } else if (r.reverse_charge_type === "third_country") {
      sums.netThirdCountry += r.net;
    }
  }
  return sums;
}

type OutgoingNet = {
  net19: number;
  net7: number;
  netIntraEuGoods: number;
  netIntraEuServices: number;
  netExportGoods: number;
  netThirdCountryServices: number;
};

/** Sums the net revenue into the Kennzahlen buckets; credit notes count negative. */
export function sumOutgoingNet(groups: VatGroupRow[]): OutgoingNet {
  const sums: OutgoingNet = {
    net19: 0,
    net7: 0,
    netIntraEuGoods: 0,
    netIntraEuServices: 0,
    netExportGoods: 0,
    netThirdCountryServices: 0,
  };
  for (const g of groups) {
    const net = g.is_credit_note === 1 ? -g.net : g.net;
    const isServices = g.supply_kind === "services";
    if (g.reverse_charge_type === "intra_eu") {
      if (isServices) sums.netIntraEuServices += net;
      else sums.netIntraEuGoods += net;
    } else if (g.reverse_charge_type === "third_country") {
      if (isServices) sums.netThirdCountryServices += net;
      else sums.netExportGoods += net;
    } else if (g.vat_rate === STANDARD_VAT_RATE) {
      sums.net19 += net;
    } else if (g.vat_rate === REDUCED_VAT_RATE) {
      sums.net7 += net;
    }
    // Kleinunternehmer (vat_rate=0) zählt in keine der hier abgebildeten Kennzahlen.
  }
  return sums;
}

type DomesticNet = { net19: number; net7: number; computedFrom: (rate: number) => string };

async function loadDomesticNet(
  vatAccounting: VatAccounting,
  from: number,
  to: number,
  outgoing: OutgoingNet,
): Promise<DomesticNet> {
  if (vatAccounting === "accrual") {
    return {
      net19: outgoing.net19,
      net7: outgoing.net7,
      computedFrom: (rate) =>
        `Rechnungen mit USt-Satz ${rate} % (Status versandt/bezahlt), Stornos negativ.`,
    };
  }
  const netByRate = cashBasisNetByRate(await loadCashBasisRows(from, to));
  return {
    net19: netByRate.get(STANDARD_VAT_RATE) ?? 0,
    net7: netByRate.get(REDUCED_VAT_RATE) ?? 0,
    computedFrom: (rate) =>
      `Ist-Versteuerung: im Quartal vereinnahmte Zahlungen auf Rechnungen mit USt-Satz ${rate} %, ` +
      `bei Teilzahlung anteilig. Erstattungen zu Stornorechnungen mindern im Quartal der Rückzahlung.`,
  };
}

export async function buildUstvaReport(
  year: number,
  quarter: Quarter,
  vatAccounting: VatAccounting,
): Promise<UstvaReport> {
  const { from, to } = quarterRange(year, quarter);
  const [invoiceGroups, inputVat, reverseChargePurchases] = await Promise.all([
    loadInvoiceGroups(from, to),
    loadDeductibleInputVat(from, to),
    loadReverseChargePurchases(from, to),
  ]);
  const outgoing = sumOutgoingNet(convertGroupsToEur(invoiceGroups));
  const domestic = await loadDomesticNet(vatAccounting, from, to, outgoing);
  const purchases = sumReverseChargePurchases(reverseChargePurchases);

  const rows: UstvaRow[] = [
    baseRow(
      "81",
      "Lieferungen und Leistungen zu 19 %",
      domestic.net19,
      domestic.computedFrom(STANDARD_VAT_RATE),
    ),
    baseRow(
      "86",
      "Lieferungen und Leistungen zu 7 %",
      domestic.net7,
      domestic.computedFrom(REDUCED_VAT_RATE),
    ),
    baseRow(
      "41",
      "Innergemeinschaftliche Lieferungen (steuerfrei)",
      outgoing.netIntraEuGoods,
      "Rechnungen mit Reverse-Charge intra_eu als Lieferung (Netto, Rechnungsdatum).",
    ),
    baseRow(
      "21",
      "Nicht steuerbare sonstige Leistungen im EU-Ausland (§ 18b S. 1 Nr. 2 UStG)",
      outgoing.netIntraEuServices,
      "Rechnungen mit Reverse-Charge intra_eu als sonstige Leistung (Netto, Rechnungsdatum).",
    ),
    baseRow(
      "43",
      "Steuerfreie Ausfuhrlieferungen (§ 4 Nr. 1a UStG)",
      outgoing.netExportGoods,
      "Rechnungen mit Reverse-Charge Drittland als Lieferung (Netto, Rechnungsdatum).",
    ),
    baseRow(
      "45",
      "Übrige nicht steuerbare Umsätze (Leistungsort nicht im Inland)",
      outgoing.netThirdCountryServices,
      "Rechnungen mit Reverse-Charge Drittland als sonstige Leistung (Netto, Rechnungsdatum).",
    ),
    baseRow(
      "46",
      "§13b-Leistungen eines EU-Unternehmers (Bemessungsgrundlage)",
      purchases.netIntraEu,
      "Eingangsrechnungen mit Reverse-Charge intra_eu (Netto). Steuer in KZ 47 und Vorsteuer in KZ 67 selbst ergänzen.",
    ),
    baseRow(
      "84",
      "§13b-Leistungen eines Drittland-Unternehmers (Bemessungsgrundlage)",
      purchases.netThirdCountry,
      "Eingangsrechnungen mit Reverse-Charge Drittland (Netto). Steuer in KZ 85 und Vorsteuer in KZ 67 selbst ergänzen.",
    ),
    {
      kz: "66",
      label: "Abziehbare Vorsteuer (aus Eingangsrechnungen)",
      amount: inputVat,
      wholeEuros: false,
      computedFrom: "Vorsteuer aus Eingangsrechnungen ohne §13b (Status offen/bezahlt).",
    },
  ];

  return { year, quarter, dateFrom: from, dateTo: to, vatAccounting, rows };
}

export function ustvaToCsv(report: UstvaReport): string {
  // Excel-freundliches CSV: UTF-8-BOM, Semikolon, Komma als Dezimaltrenner.
  const lines = ["Kennzahl;Beschreibung;Betrag (EUR);Berechnet aus"];
  for (const r of report.rows) {
    const euros = (r.amount / CENTS_PER_EURO).toFixed(r.wholeEuros ? 0 : 2).replace(".", ",");
    lines.push(`${r.kz};${escapeCsvField(r.label)};${euros};${escapeCsvField(r.computedFrom)}`);
  }
  return UTF8_BOM + lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}
