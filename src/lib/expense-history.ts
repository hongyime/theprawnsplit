import type { ExpenseState, Financials } from "@theprawnsplit/core";

export interface ExpenseHistoryRow {
  financials: Financials;
  label: string;
  active: boolean;
}

function sameFinancials(a: Financials, b: Financials): boolean {
  return a.minor === b.minor && sameRows(a.payers, b.payers) && sameRows(a.shares, b.shares) && sameRate(a.rate, b.rate);
}

function sameRows(a: { pid: string; minor: bigint }[], b: { pid: string; minor: bigint }[]): boolean {
  return a.length === b.length && a.every((row, index) => row.pid === b[index]?.pid && row.minor === b[index]?.minor);
}

function sameRate(a: Financials["rate"], b: Financials["rate"]): boolean {
  if (!a || !b) return a === b;
  return a.currency === b.currency && a.toBase === b.toBase;
}

export function expenseHistoryRows(expense: Pick<ExpenseState, "financials" | "financialHistory">): ExpenseHistoryRow[] {
  return expense.financialHistory.map((financials, index) => ({
    financials,
    label: index === 0 ? "Original" : `Correction ${index}`,
    active: sameFinancials(financials, expense.financials),
  }));
}
