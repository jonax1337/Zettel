/**
 * Ist-Versteuerung (§ 20 UStG): steuerpflichtige Inlandsumsätze entstehen erst
 * mit der Vereinnahmung. Grundlage sind die Zahlungen in `invoice_payments`.
 *
 * Stornorechnungen sind Entgeltsminderungen (§ 17 UStG). Bei Ist-Versteuerung
 * wird die Bemessungsgrundlage erst berichtigt, wenn das Entgelt tatsächlich
 * zurückgezahlt wird — also mit der als Zahlung erfassten Erstattung der
 * Stornorechnung. Ein Storno einer nie bezahlten Rechnung ändert nichts, weil
 * deren Umsatz nie vereinnahmt wurde.
 */
import { select } from "$lib/db/client";

/** One VAT-rate group of an invoice that received payments in the period. */
export type CashBasisRow = {
  invoice_id: number;
  is_credit_note: number;
  /** Signed gross total in the invoice currency (credit notes negative). */
  total: number;
  currency: string | null;
  /** Signed frozen EUR gross total; only meaningful for foreign-currency invoices. */
  eur_total_cent: number | null;
  /** Payments (invoice currency) received before the period starts. */
  paid_before: number;
  /** Payments (invoice currency) received up to the period end. */
  paid_through: number;
  vat_rate: number;
  /** Sum of the group's line totals (invoice currency, always positive). */
  net: number;
};

export type RateNet = { rate: number; net: number };

type CashInvoice = {
  sign: 1 | -1;
  grossTotal: number;
  eurGrossTotal: number | null;
  paidBefore: number;
  paidThrough: number;
  groups: RateNet[];
};

/**
 * Domestic invoices (no reverse charge) with at least one payment in the
 * period, with their cumulative payments before and through the period.
 */
export async function loadCashBasisRows(from: number, to: number): Promise<CashBasisRow[]> {
  return await select<CashBasisRow>(
    `WITH paid AS (
       SELECT invoice_id,
              SUM(CASE WHEN paid_at < ? THEN amount_cent ELSE 0 END) AS paid_before,
              SUM(amount_cent) AS paid_through
       FROM invoice_payments
       WHERE paid_at <= ?
       GROUP BY invoice_id
       HAVING MAX(paid_at) >= ?
     )
     SELECT
       i.id AS invoice_id,
       i.is_credit_note AS is_credit_note,
       i.total AS total,
       i.currency AS currency,
       i.eur_total_cent AS eur_total_cent,
       paid.paid_before AS paid_before,
       paid.paid_through AS paid_through,
       ii.vat_rate AS vat_rate,
       SUM(ii.line_total) AS net
     FROM invoices i
     JOIN paid ON paid.invoice_id = i.id
     JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE i.status IN ('sent','partial','paid')
       AND i.reverse_charge_type NOT IN ('intra_eu','third_country')
     GROUP BY i.id, ii.vat_rate`,
    [from, to, from],
  );
}

/**
 * EUR net revenue per VAT rate recognised in the period: the share of each
 * invoice's net that the period's payments settle. Refunds on credit notes
 * count negative.
 */
export function cashBasisNetByRate(rows: CashBasisRow[]): Map<number, number> {
  const netByRate = new Map<number, number>();
  for (const invoice of groupByInvoice(rows)) {
    const before = recognisedNet(invoice, invoice.paidBefore);
    const through = recognisedNet(invoice, invoice.paidThrough);
    invoice.groups.forEach(({ rate }, i) => {
      const net = (through[i] - before[i]) * invoice.sign;
      netByRate.set(rate, (netByRate.get(rate) ?? 0) + net);
    });
  }
  return netByRate;
}

function groupByInvoice(rows: CashBasisRow[]): CashInvoice[] {
  const invoices = new Map<number, CashInvoice>();
  for (const r of rows) {
    let invoice = invoices.get(r.invoice_id);
    if (!invoice) {
      invoice = {
        sign: r.is_credit_note === 1 ? -1 : 1,
        grossTotal: Math.abs(r.total),
        eurGrossTotal: isForeignCurrency(r) ? Math.abs(r.eur_total_cent) : null,
        paidBefore: r.paid_before,
        paidThrough: r.paid_through,
        groups: [],
      };
      invoices.set(r.invoice_id, invoice);
    }
    invoice.groups.push({ rate: r.vat_rate, net: r.net });
  }
  return [...invoices.values()];
}

/** True when the invoice must be converted via its frozen EUR total. */
export function isForeignCurrency<T extends { currency: string | null; eur_total_cent: number | null }>(
  r: T,
): r is T & { eur_total_cent: number } {
  return !!r.currency && r.currency !== "EUR" && r.eur_total_cent != null;
}

/**
 * EUR net per group settled by `paid` (cumulative). Overpayments beyond the
 * gross total are not Entgelt of this invoice and are capped.
 */
function recognisedNet(invoice: CashInvoice, paid: number): number[] {
  const settledRatio = invoice.grossTotal === 0 ? 0 : Math.min(paid, invoice.grossTotal) / invoice.grossTotal;
  return recognisedEurNet(invoice.groups, invoice.grossTotal, invoice.eurGrossTotal, settledRatio);
}

/**
 * EUR net per group for the share `settledRatio` (0..1) of the invoice that is
 * settled. Recognising cumulative shares and taking differences keeps the
 * rounding telescoping: all periods together add up to exactly the invoice's net.
 */
export function recognisedEurNet(
  groups: RateNet[],
  grossTotal: number,
  eurGrossTotal: number | null,
  settledRatio: number,
): number[] {
  if (grossTotal === 0) return groups.map(() => 0);
  return apportion(groups, Math.round(eurNetTotal(groups, grossTotal, eurGrossTotal) * settledRatio));
}

/** Foreign-currency invoices convert via their frozen EUR total, like the DATEV export. */
export function eurNetTotal(
  groups: RateNet[],
  grossTotal: number,
  eurGrossTotal: number | null,
): number {
  const netTotal = sumNet(groups);
  if (eurGrossTotal === null) return netTotal;
  return Math.round((netTotal * eurGrossTotal) / grossTotal);
}

/**
 * Splits `target` across the groups in proportion to their net. The rounding
 * residual goes to the group with the largest net (first one on ties), so the
 * shares sum exactly to `target`.
 */
export function apportion(groups: Pick<RateNet, "net">[], target: number): number[] {
  const netTotal = sumNet(groups);
  if (netTotal === 0) return groups.map(() => 0);

  const shares = groups.map((g) => Math.round((g.net / netTotal) * target));
  const residual = target - shares.reduce((a, b) => a + b, 0);

  let largest = 0;
  groups.forEach((g, i) => {
    if (Math.abs(g.net) > Math.abs(groups[largest].net)) largest = i;
  });
  shares[largest] += residual;
  return shares;
}

function sumNet(groups: Pick<RateNet, "net">[]): number {
  return groups.reduce((total, g) => total + g.net, 0);
}
