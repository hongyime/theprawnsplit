import { authorisedKeys, contestedClaimPids, type Event, type VerificationContext } from "@theprawnsplit/core";

export interface SettlementClaimView {
  payment: Extract<Event, { t: "SettlementRecorded" }> | undefined;
  dispute: Extract<Event, { t: "SettlementDisputed" }> | undefined;
}

export function settlementClaimView(events: Event[], sid: string): SettlementClaimView {
  const payment = events.find((event): event is Extract<Event, { t: "SettlementRecorded" }> => event.t === "SettlementRecorded" && event.sid === sid);
  const dispute = events.find((event): event is Extract<Event, { t: "SettlementDisputed" }> => event.t === "SettlementDisputed" && event.sid === sid);
  return { payment, dispute };
}

// SEC-002/T47: reversal authority belongs to ANY current group member (design.md
// §B2 point 1), never the device that happened to record the settlement. This
// picks the FIRST local pid (from this device's own claim identities) that is
// both currently authorised (a non-empty authorisedKeys set) and not contested
// -- the same selection Trip.svelte's voidSettlement signs with, so the UI's
// enable/disable guard and the actual signing authority are always identical.
export function usableVoidAuthorityPid(events: Event[], localPids: string[], ctx: VerificationContext): string | undefined {
  const contested = contestedClaimPids(events, ctx);
  return localPids.find((pid) => !contested.has(pid) && authorisedKeys(events, pid, ctx).size > 0);
}

export function canVoidRecordedSettlement(events: Event[], sid: string, localPids: string[], ctx: VerificationContext): boolean {
  const settlement = events.find((event) => event.t === "SettlementRecorded" && event.sid === sid);
  if (!settlement) return false;
  return usableVoidAuthorityPid(events, localPids, ctx) !== undefined;
}
