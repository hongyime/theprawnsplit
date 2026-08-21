import { describe, expect, it } from "vitest";
import { admitTransportEvents } from "../src/transport";
import { base, hlc } from "./helpers";
import type { Event } from "../src/types";

function event(dev: string, ctr: number, wall = ctr): Event {
  return base("ExpenseAdded", {
    id: `${dev}:${ctr}`,
    dev,
    hlc: hlc(wall, ctr, dev),
    xid: `${dev}-${ctr}`,
    financials: { minor: 1n, payers: [{ pid: "a", minor: 1n }], shares: [{ pid: "a", minor: 1n }] },
    desc: `${dev}-${ctr}`,
    at: wall,
    date: "2026-08-21",
  } as never);
}

describe("REQ-SYN-19/24/27 transport admission", () => {
  it("drops surplus from one author only and advances discardVector", () => {
    const incoming = [event("throwaway", 1), event("throwaway", 2), event("throwaway", 3), event("peer", 1)];
    const result = admitTransportEvents(incoming, [], {}, {
      now: 10,
      supportedVersion: 1,
      maxFutureDriftMs: 120_000,
      capUnknownAuthor: 2,
      capKnownAuthor: 1000,
      bufferMaxEvents: 500,
    });

    expect(result.admitted.map((e) => e.id)).toEqual(["throwaway:1", "throwaway:2", "peer:1"]);
    expect(result.dropped.map((drop) => [drop.event.id, drop.reason])).toEqual([["throwaway:3", "cap"]]);
    expect(result.discardVector).toEqual({ throwaway: 3 });
  });

  it("buffers future events without mutating HLC and later admits them", () => {
    const future = event("fast", 1, 300_000);
    const first = admitTransportEvents([future], [], {}, {
      now: 0,
      supportedVersion: 1,
      maxFutureDriftMs: 120_000,
      capUnknownAuthor: 50,
      capKnownAuthor: 1000,
      bufferMaxEvents: 500,
    });
    expect(first.admitted).toHaveLength(0);
    expect(first.buffered).toEqual([{ event: future, retryAt: 180_000 }]);
    expect(future.hlc.wall).toBe(300_000);

    const second = admitTransportEvents([future], [], {}, {
      now: 180_000,
      supportedVersion: 1,
      maxFutureDriftMs: 120_000,
      capUnknownAuthor: 50,
      capKnownAuthor: 1000,
      bufferMaxEvents: 500,
    });
    expect(second.admitted.map((e) => e.id)).toEqual(["fast:1"]);
  });

  it("counts held future events against the same per-author budget", () => {
    const incoming = [event("fast", 1, 300_000), event("fast", 2, 300_001)];
    const result = admitTransportEvents(incoming, [], {}, {
      now: 0,
      supportedVersion: 1,
      maxFutureDriftMs: 120_000,
      capUnknownAuthor: 1,
      capKnownAuthor: 1000,
      bufferMaxEvents: 500,
    });
    expect(result.buffered.map((held) => held.event.id)).toEqual(["fast:1"]);
    expect(result.dropped.map((drop) => drop.event.id)).toEqual(["fast:2"]);
    expect(result.discardVector).toEqual({ fast: 2 });
  });
});
