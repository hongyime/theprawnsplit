import { describe, expect, it } from "vitest";
import { makeEvent, makeHlc, type EventFactory } from "@/lib/events";

// LOGIC-002: event construction previously always sampled Date.now() for
// hlc.wall, ignoring any persisted observed clock. If this device's own
// wall clock lags behind an already-synced remote peer's (clock skew, or
// this device coming back online after being offline while peers kept
// advancing), a causally-later local edit could get an EARLIER hlc.wall
// than the remote root it is editing, sorting before it and being ignored
// by ordering-sensitive fold() logic. makeHlc/makeEvent now accept an
// optional floor (the persisted observed HLC, supplied by reserveEventIds)
// that new timestamps must never fall behind.

describe("LOGIC-002 makeHlc/makeEvent respect an observed-HLC floor", () => {
  it("uses the real wall clock when it is already ahead of the floor", () => {
    const floor = { wall: 1_000, ctr: 5, dev: "peer" };
    const hlc = makeHlc("me", 3, floor);
    expect(hlc.wall).toBeGreaterThanOrEqual(Date.now() - 1000); // sane, real time
    expect(hlc.wall).toBeGreaterThan(floor.wall);
    expect(hlc.dev).toBe("me"); // never inherits the floor's device
  });

  it("never produces a wall clock earlier than the floor, even if Date.now() would be", () => {
    const farFutureFloor = { wall: Date.now() + 10_000_000, ctr: 2, dev: "fast-peer" };
    const hlc = makeHlc("me", 7, farFutureFloor);
    expect(hlc.wall).toBe(farFutureFloor.wall);
    expect(hlc.ctr).toBe(farFutureFloor.ctr + 1); // monotonic bump, not a copy
    expect(hlc.dev).toBe("me");
  });

  it("makeEvent passes the factory's hlcFloor through to the built event's hlc", () => {
    const farFutureFloor = { wall: Date.now() + 10_000_000, ctr: 9, dev: "fast-peer" };
    const factory: EventFactory = { deviceId: "me", nextCounter: 1, hlcFloor: farFutureFloor };
    const event = makeEvent(factory, "ParticipantMerged", { from: "a", into: "b" });
    expect(event.hlc.wall).toBe(farFutureFloor.wall);
    expect(event.hlc.ctr).toBe(farFutureFloor.ctr + 1);
    expect(event.hlc.dev).toBe("me");
  });

  it("falls back to a bare Date.now() clock when no floor is supplied (backward compatible)", () => {
    const before = Date.now();
    const hlc = makeHlc("me", 4);
    expect(hlc.wall).toBeGreaterThanOrEqual(before);
    expect(hlc.ctr).toBe(4);
    expect(hlc.dev).toBe("me");
  });
});
