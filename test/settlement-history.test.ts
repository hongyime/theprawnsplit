import { describe, expect, it } from "vitest";
import type { Event, VerificationContext } from "@theprawnsplit/core";
import { canVoidRecordedSettlement, settlementClaimView, usableVoidAuthorityPid } from "@/lib/settlement-history";

const groupTag = "a".repeat(64);

const event = (payload: Partial<Event> & Pick<Event, "t">): Event =>
  ({
    v: 1,
    id: `${payload.t}:1`,
    hlc: { wall: 1, ctr: 1, dev: "payer-phone" },
    dev: "payer-phone",
    ...payload,
  }) as Event;

// SEC-002/T47: a lightweight, deterministic mock verifier for THIS unit test
// only (matching core's own test-helper style) -- real end-to-end signature
// verification through actual crypto is already covered by
// test/verification.test.ts. canVoidRecordedSettlement/usableVoidAuthorityPid
// don't need real crypto to prove they select the right local pid; they just
// need a working, honest verifySignature to exercise authorisedKeys/
// contestedClaimPids correctly.
const sig = (publicKey: string, payload: string): string => `sig:${publicKey}:${payload}`;
const verifier: VerificationContext = {
  groupTag,
  verifySignature(input) {
    return input.signature === sig(input.publicKey, input.payload);
  },
};

const claim = (pid: string, deviceId: string, publicKey: string): Event =>
  ({
    v: 1,
    id: `${deviceId}:1`,
    hlc: { wall: 1, ctr: 1, dev: deviceId },
    dev: deviceId,
    t: "ParticipantClaimed",
    pid,
    deviceId,
    claimPk: publicKey,
    alg: "ed25519",
    sig: sig(publicKey, `${groupTag}:${pid}:${deviceId}:${publicKey}`),
  }) as Event;

describe("settlement history presentation", () => {
  it("keeps payment and dispute claims visible side by side", () => {
    const payment = event({ t: "SettlementRecorded", sid: "s1", from: "bob", to: "alice", minor: 100n });
    const dispute = event({ t: "SettlementDisputed", sid: "s1", note: "Cash was not received", dev: "alice-phone" });

    expect(settlementClaimView([payment, dispute], "s1")).toEqual({ payment, dispute });
  });
});

// SEC-002/T47: reversal authority belongs to ANY current group member
// (design.md §B2 point 1), never the device that recorded the settlement.
describe("SEC-002/T47 settlement void authority", () => {
  it("allows a local pid with no relation to the settlement's own from/to parties to offer the void action", () => {
    const events = [claim("carol", "carol-phone", "carol-key"), event({ t: "SettlementRecorded", sid: "s1", from: "bob", to: "alice", minor: 100n })];

    expect(canVoidRecordedSettlement(events, "s1", ["carol"], verifier)).toBe(true);
    expect(usableVoidAuthorityPid(events, ["carol"], verifier)).toBe("carol");
  });

  it("never offers the void action for a local pid with no currently-authorised keys at all", () => {
    const events = [event({ t: "SettlementRecorded", sid: "s1", from: "bob", to: "alice", minor: 100n })];

    // "unknown-pid" was never claimed by anyone -- authorisedKeys is empty.
    expect(canVoidRecordedSettlement(events, "s1", ["unknown-pid"], verifier)).toBe(false);
    expect(usableVoidAuthorityPid(events, ["unknown-pid"], verifier)).toBeUndefined();
  });

  it("never offers the void action for a local pid whose own claim is contested", () => {
    const events = [
      claim("carol", "carol-phone", "carol-key"),
      claim("carol", "carol-tablet", "carol-tablet-key"), // unpaired second claim -- contested
      event({ t: "SettlementRecorded", sid: "s1", from: "bob", to: "alice", minor: 100n }),
    ];

    expect(canVoidRecordedSettlement(events, "s1", ["carol"], verifier)).toBe(false);
    expect(usableVoidAuthorityPid(events, ["carol"], verifier)).toBeUndefined();
  });

  it("never offers the void action when no settlement exists for the given sid", () => {
    const events = [claim("carol", "carol-phone", "carol-key")];
    expect(canVoidRecordedSettlement(events, "no-such-sid", ["carol"], verifier)).toBe(false);
  });

  it("picks the FIRST qualifying local pid when this device holds multiple claim identities", () => {
    const events = [
      claim("carol", "carol-phone", "carol-key"),
      claim("dave", "dave-phone", "dave-key"),
      event({ t: "SettlementRecorded", sid: "s1", from: "bob", to: "alice", minor: 100n }),
    ];

    expect(usableVoidAuthorityPid(events, ["unknown-pid", "carol", "dave"], verifier)).toBe("carol");
  });
});
