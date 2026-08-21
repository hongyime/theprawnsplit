export function expenseDisplayRows<T extends { date: string }>(expenses: Iterable<T>): T[] {
  return [...expenses].sort((a, b) => b.date.localeCompare(a.date));
}
