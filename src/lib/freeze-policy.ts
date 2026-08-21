import type { State } from "@theprawnsplit/core";

export interface FrozenViewPolicy {
  displayBalances: boolean;
  allowSettlementActions: boolean;
  message: string | undefined;
}

export function frozenViewPolicy(state: Pick<State, "frozen" | "quarantined"> | null | undefined): FrozenViewPolicy {
  if (!state?.frozen) return { displayBalances: true, allowSettlementActions: true, message: undefined };
  const count = state.quarantined.length;
  return {
    displayBalances: false,
    allowSettlementActions: false,
    message: `${count} newer ledger event${count === 1 ? "" : "s"} retained but excluded. Update before trusting balances or settlements.`,
  };
}
