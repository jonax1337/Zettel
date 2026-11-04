export interface ExpenseSums {
  netCent: number;
  grossCent: number;
}

export interface ReserveExpenseSettings {
  isKleinunternehmer: boolean;
  taxReserveExpensesGross: boolean;
}

/** Kleinunternehmer:innen ziehen keine Vorsteuer, deshalb ist brutto dort die steuerlich korrekte Betriebsausgabe. */
export function deductsExpensesGross(settings: ReserveExpenseSettings): boolean {
  return settings.isKleinunternehmer && settings.taxReserveExpensesGross;
}

export function deductibleExpenseCent(sums: ExpenseSums, settings: ReserveExpenseSettings): number {
  return deductsExpensesGross(settings) ? sums.grossCent : sums.netCent;
}
