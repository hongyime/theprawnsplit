import type { ExpenseState, Financials } from "@theprawnsplit/core";

export interface ExpenseHistoryRow {
  financials: Financials;
  label: string;
  active: boolean;
}

export function expenseHistoryRows(expense: Pick<ExpenseState, "financials" | "financialHistory" | "activeFinancialIndex">): ExpenseHistoryRow[] {
  return expense.financialHistory.map((financials, index) => ({
    financials,
    label: index === 0 ? "Original" : `Correction ${index}`,
    active: index === expense.activeFinancialIndex,
  }));
}
