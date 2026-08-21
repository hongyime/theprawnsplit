import { describe, expect, it } from "vitest";
import type { Event } from "@theprawnsplit/core";
import { canVoidRecordedSettlement, settlementClaimView } from "@/lib/settlement-history";

const event = (payload: Partial<Event> & Pick<Event, "t">): Event =>
  ({
    v: 1,
    id: `${payload.t}:1`,
    hlc: { wall: 1, ctr: 1, dev: "payer-phone" },
    dev: "payer-phone",
    ...payload,
  }) as Event;

describe("settlement history presentation", () => {
  it("keeps payment and dispute claims visible side by side", () => {
    const payment = event({ t: "SettlementRecorded", sid: "s1", from: "bob", to: "alice", minor: 100n });
    const dispute = event({ t: "SettlementDisputed", sid: "s1", note: "Cash was not received", dev: "alice-phone" });

    expect(settlementClaimView([payment, dispute], "s1")).toEqual({ payment, dispute });
  });

  it("allows only the recording device to offer local void action", () => {
    const payment = event({ t: "SettlementRecorded", sid: "s1", from: "bob", to: "alice", minor: 100n });

    expect(canVoidRecordedSettlement([payment], "s1", "payer-phone")).toBe(true);
    expect(canVoidRecordedSettlement([payment], "s1", "alice-phone")).toBe(false);
  });
});
