import type { Event } from "@theprawnsplit/core";

export interface SettlementClaimView {
  payment: Extract<Event, { t: "SettlementRecorded" }> | undefined;
  dispute: Extract<Event, { t: "SettlementDisputed" }> | undefined;
}

export function settlementClaimView(events: Event[], sid: string): SettlementClaimView {
  const payment = events.find((event): event is Extract<Event, { t: "SettlementRecorded" }> => event.t === "SettlementRecorded" && event.sid === sid);
  const dispute = events.find((event): event is Extract<Event, { t: "SettlementDisputed" }> => event.t === "SettlementDisputed" && event.sid === sid);
  return { payment, dispute };
}

export function canVoidRecordedSettlement(events: Event[], sid: string, deviceId: string): boolean {
  return events.some((event) => event.t === "SettlementRecorded" && event.sid === sid && event.dev === deviceId);
}
