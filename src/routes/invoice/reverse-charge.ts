type VatRated = { uid: number; vatRate: number };

/** Per-position VAT rates remembered while reverse charge forces them to 0, keyed by row uid. */
export type VatRateSnapshot = Map<number, number>;

/** Zeroes every non-zero rate in place and remembers the first original rate of each row. */
export function zeroVatRatesRemembering(items: VatRated[], snapshot: VatRateSnapshot): void {
  for (const item of items) {
    if (item.vatRate === 0) continue;
    if (!snapshot.has(item.uid)) snapshot.set(item.uid, item.vatRate);
    item.vatRate = 0;
  }
}

/** Puts remembered rates back on rows still at 0 and empties the snapshot. */
export function restoreVatRates(items: VatRated[], snapshot: VatRateSnapshot): void {
  for (const item of items) {
    const remembered = snapshot.get(item.uid);
    if (remembered !== undefined && item.vatRate === 0) item.vatRate = remembered;
  }
  snapshot.clear();
}
