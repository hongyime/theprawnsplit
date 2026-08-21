export function canAppendExpense(input: {
  archived: boolean;
  hasLocalClaim: boolean;
  description: string;
  amountOk: boolean;
  sharesOk: boolean;
  payersOk: boolean;
}): boolean {
  return Boolean(!input.archived && input.hasLocalClaim && input.description.trim() && input.amountOk && input.sharesOk && input.payersOk);
}
