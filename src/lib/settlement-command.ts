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

export function hasActiveClaimAnomaly(
  anomalies: { code: string; pid?: string }[],
  pid: string,
): boolean {
  return anomalies.some(
    (anomaly) => anomaly.pid === pid && (anomaly.code === "unverified-reclaim" || anomaly.code === "device-claims-multiple-participants"),
  );
}

export function canConfirmSettlement(input: {
  archived: boolean;
  allowSettlementActions: boolean;
  pending: boolean;
  hasLocalPayeeIdentity: boolean;
  payeeHasActiveClaimAnomaly: boolean;
}): boolean {
  return Boolean(
    !input.archived &&
      input.allowSettlementActions &&
      input.pending &&
      input.hasLocalPayeeIdentity &&
      !input.payeeHasActiveClaimAnomaly,
  );
}
