export function canRecordSettlement(input: {
  archived: boolean;
  allowSettlementActions: boolean;
  from: string;
  to: string;
  minor: bigint | null;
}): boolean {
  return Boolean(
    !input.archived &&
      input.allowSettlementActions &&
      input.from &&
      input.to &&
      input.from !== input.to &&
      input.minor !== null &&
      input.minor > 0n,
  );
}
