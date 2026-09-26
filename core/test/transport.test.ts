import { describe, expect, it } from "vitest";
import { admitTransportEvents, mergeCoverageCounter, type CoverageIntervals } from "../src/transport";
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

function marker(dev: string, ctr: number, wall = ctr): Event {
  return base("ParticipantAdded", {
    id: `${dev}:${ctr}`,
    dev,
    hlc: hlc(wall, ctr, dev),
    pid: `p-${dev}`,
    name: dev,
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
      capGroupTotal: 10_000,
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
      capGroupTotal: 10_000,
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
      capGroupTotal: 10_000,
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
      capGroupTotal: 10_000,
      bufferMaxEvents: 500,
    });
    expect(result.buffered.map((held) => held.event.id)).toEqual(["fast:1"]);
    expect(result.dropped.map((drop) => drop.event.id)).toEqual(["fast:2"]);
    expect(result.discardVector).toEqual({ fast: 2 });
  });

  it("drops surplus over the group-total admission cap without blocking existing events", () => {
    const current = [event("peer-a", 1), event("peer-b", 1)];
    const incoming = [event("peer-c", 1), event("peer-d", 1)];
    const result = admitTransportEvents(incoming, current, {}, {
      now: 10,
      supportedVersion: 1,
      maxFutureDriftMs: 120_000,
      capUnknownAuthor: 50,
      capKnownAuthor: 1000,
      capGroupTotal: 3,
      bufferMaxEvents: 500,
    });

    expect(result.admitted.map((e) => e.id)).toEqual(["peer-c:1"]);
    expect(result.dropped.map((drop) => [drop.event.id, drop.reason])).toEqual([["peer-d:1", "cap"]]);
    expect(result.discardVector).toEqual({ "peer-d": 1 });
  });

  it("rejects non-finite HLC numbers as malformed before any other admission rule (CR-011)", () => {
    const nanWall = event("broken", 1);
    if (nanWall.t !== "ExpenseAdded") throw new Error("wrong fixture");
    nanWall.hlc = { wall: Number.NaN, ctr: 1, dev: "broken" };
    const infCtr = event("broken", 2);
    if (infCtr.t !== "ExpenseAdded") throw new Error("wrong fixture");
    infCtr.hlc = { wall: 5, ctr: Number.POSITIVE_INFINITY, dev: "broken" };
    const wellFormed = event("peer", 1);

    const result = admitTransportEvents([nanWall, infCtr, wellFormed], [], {}, {
      now: 10,
      supportedVersion: 1,
      maxFutureDriftMs: 120_000,
      capUnknownAuthor: 50,
      capKnownAuthor: 1000,
      capGroupTotal: 10_000,
      bufferMaxEvents: 500,
    });

    expect(result.dropped.map((drop) => [drop.event.dev, drop.reason])).toEqual([
      ["broken", "malformed"],
      ["broken", "malformed"],
    ]);
    expect(result.admitted.map((e) => e.id)).toEqual([wellFormed.id]);
    // Malformed events still advance the discard vector so they are never refetched.
    expect(result.discardVector).toEqual({ broken: 2 });
  });
});

describe("DATA-004 batch-context author classification", () => {
  it("treats a brand-new author as known for cap purposes once their own marker appears anywhere in this batch", () => {
    const incoming = [event("newdev", 1), event("newdev", 2), marker("newdev", 3), event("newdev", 4), event("newdev", 5)];
    const result = admitTransportEvents(incoming, [], {}, {
      now: 10,
      supportedVersion: 1,
      maxFutureDriftMs: 120_000,
      capUnknownAuthor: 2,
      capKnownAuthor: 1000,
      capGroupTotal: 10_000,
      bufferMaxEvents: 500,
    });
    // Without the fix, only 2 events (capUnknownAuthor) would fit before the
    // 3rd overflows it, even though this author's own marker (proving they
    // are legitimate) is IN this same batch — just not first.
    expect(result.dropped).toEqual([]);
    expect(result.admitted).toHaveLength(5);
  });

  it("does not trust a marker event with a malformed HLC as an eligibility signal", () => {
    const badMarker = marker("faker", 1);
    if (badMarker.t !== "ParticipantAdded") throw new Error("wrong fixture");
    badMarker.hlc = { wall: Number.NaN, ctr: 1, dev: "faker" };
    const incoming = [badMarker, event("faker", 2), event("faker", 3)];
    const result = admitTransportEvents(incoming, [], {}, {
      now: 10,
      supportedVersion: 1,
      maxFutureDriftMs: 120_000,
      capUnknownAuthor: 1,
      capKnownAuthor: 1000,
      capGroupTotal: 10_000,
      bufferMaxEvents: 500,
    });
    // The malformed marker itself is dropped; the remaining well-formed
    // events must still be judged under capUnknownAuthor, not
    // capKnownAuthor — a malformed marker must never grant elevated trust.
    expect(result.dropped.map((d) => [d.event.id, d.reason])).toEqual([
      ["faker:1", "malformed"],
      ["faker:3", "cap"],
    ]);
    expect(result.admitted.map((e) => e.id)).toEqual(["faker:2"]);
  });
});

// DATA-007: versionVector/transportVector track TRANSPORT PROGRESS -- what
// counter has been OBSERVED from each author, including buffered/dropped/
// conflicted events that were never actually stored. coverage is a
// SEPARATE, exact record of which counters have a REAL event row present,
// as sorted non-overlapping [start, end] intervals -- so a hole in the
// middle of an otherwise-covered run is represented explicitly instead of
// being silently erased by a single running maximum.
describe("DATA-007 mergeCoverageCounter (pure interval merge)", () => {
  it("starts a fresh interval from an empty list", () => {
    expect(mergeCoverageCounter([], 5)).toEqual([[5, 5]]);
  });

  it("extends an existing interval forward and backward", () => {
    expect(mergeCoverageCounter([[3, 5]], 6)).toEqual([[3, 6]]);
    expect(mergeCoverageCounter([[3, 5]], 2)).toEqual([[2, 5]]);
  });

  it("keeps a non-adjacent counter as its own separate interval, representing a hole explicitly", () => {
    expect(mergeCoverageCounter([[1, 3]], 6)).toEqual([
      [1, 3],
      [6, 6],
    ]);
  });

  it("bridges two previously-separate intervals into one when the inserted counter fills the exact gap", () => {
    expect(
      mergeCoverageCounter(
        [
          [1, 2],
          [4, 5],
        ],
        3,
      ),
    ).toEqual([[1, 5]]);
  });

  it("is idempotent for a counter already covered", () => {
    const existing: CoverageIntervals = [[1, 5]];
    expect(mergeCoverageCounter(existing, 3)).toEqual([[1, 5]]);
  });

  it("never mutates the input array", () => {
    const existing: CoverageIntervals = [[1, 2]];
    const frozen = JSON.parse(JSON.stringify(existing));
    mergeCoverageCounter(existing, 10);
    expect(existing).toEqual(frozen);
  });
});
