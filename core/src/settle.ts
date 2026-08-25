import { compareCodepoints, type Money } from "./types";

export interface Transfer {
  from: string;
  to: string;
  minor: Money;
}

interface Entry {
  pid: string;
  minor: Money;
}

const byAmountDescPidAsc = (a: Entry, b: Entry): number => {
  if (a.minor !== b.minor) return a.minor > b.minor ? -1 : 1;
  return compareCodepoints(a.pid, b.pid);
};

export function greedySettlement(balances: Map<string, Money>): Transfer[] {
  const creditors: Entry[] = [];
  const debtors: Entry[] = [];

  for (const [pid, balance] of balances) {
    if (balance > 0n) creditors.push({ pid, minor: balance });
    if (balance < 0n) debtors.push({ pid, minor: -balance });
  }

  creditors.sort(byAmountDescPidAsc);
  debtors.sort(byAmountDescPidAsc);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const minor = creditor.minor < debtor.minor ? creditor.minor : debtor.minor;
    if (minor > 0n) transfers.push({ from: debtor.pid, to: creditor.pid, minor });
    creditor.minor -= minor;
    debtor.minor -= minor;
    if (creditor.minor === 0n) ci += 1;
    if (debtor.minor === 0n) di += 1;
  }

  return transfers;
}
