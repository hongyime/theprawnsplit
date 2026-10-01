import { describe, expect, it } from "vitest";
import type { CoverageIntervals, Event } from "@theprawnsplit/core";
import { isEventCoveredByEveryKnownDevice, latestCoverageByDevice, latestVersionVectorsByDevice } from "@/lib/sync-coverage";

function event(
  dev: string,
  ctr: number,
  opts: { vv?: Record<string, number>; coverage?: Record<string, CoverageIntervals> } = {},
): Event {
  return {
    v: 1,
    id: `${dev}:${ctr}`,
    hlc: { wall: ctr, ctr, dev },
    dev,
    t: "ParticipantAdded",
    pid: `${dev}-person`,
    name: dev,
    ...(opts.vv ? { vv: opts.vv } : {}),
    ...(opts.coverage ? { coverage: opts.coverage } : {}),
  };
}

// DATA-007: isEventCoveredByEveryKnownDevice used to trust each known
// device's latest self-reported .vv (transport/observed progress, which
// can include counters that were buffered/dropped/conflicted and never
// actually durably retained) and return a plain boolean -- so it could
// claim "everyone has this" from evidence that only proved observation,
// never possession. T43 replaces that with a tri-state driven by each
// device's own exact-durable-coverage evidence (.coverage), reserving
// "covered" for genuine confirmed proof and falling back to "unknown"
// (never a false "covered") when only legacy vector-only evidence exists.
describe("REQ-SYN-10 / DATA-007 delivery coverage", () => {
  it("returns not-covered when a known device's latest coverage evidence excludes the target's counter", () => {
    const target = event("alice-phone", 2, { coverage: { "alice-phone": [[1, 2]] } });
    const stalePeer = event("bob-phone", 1, { coverage: { "alice-phone": [[1, 1]], "bob-phone": [[1, 1]] } });

    expect(isEventCoveredByEveryKnownDevice([target, stalePeer], target)).toBe("not-covered");
  });

  it("returns covered only once every known device's latest coverage evidence genuinely includes the target's counter", () => {
    const target = event("alice-phone", 2, { coverage: { "alice-phone": [[1, 2]] } });
    const stalePeer = event("bob-phone", 1, { coverage: { "alice-phone": [[1, 1]], "bob-phone": [[1, 1]] } });
    const caughtUpPeer = event("bob-phone", 2, { coverage: { "alice-phone": [[1, 2]], "bob-phone": [[1, 2]] } });

    // bob-phone's ONLY (and thus latest) event is stalePeer here -- it has
    // not yet durably retained alice-phone's counter 2.
    expect(isEventCoveredByEveryKnownDevice([target, stalePeer], target)).toBe("not-covered");
    // caughtUpPeer supersedes stalePeer as bob-phone's LATEST event once
    // both are present (later HLC) -- now genuinely covered by everyone.
    expect(isEventCoveredByEveryKnownDevice([target, stalePeer, caughtUpPeer], target)).toBe("covered");
  });

  it("returns unknown, never covered, for a device whose latest event carries only legacy vv evidence and no coverage field (the actual DATA-007 bug)", () => {
    const target = event("alice-phone", 2, { coverage: { "alice-phone": [[1, 2]] } });
    // bob-phone's latest event only ever learned to stamp the OLD vv field
    // (an already-open old-format bundle) -- it may or may not genuinely
    // have durably retained target, but we have no PROOF either way.
    const legacyPeer = event("bob-phone", 2, { vv: { "alice-phone": 2, "bob-phone": 2 } });

    expect(isEventCoveredByEveryKnownDevice([target, legacyPeer], target)).toBe("unknown");
  });

  it("prioritizes a confirmed not-covered gap over an unknown legacy peer", () => {
    const target = event("alice-phone", 2, { coverage: { "alice-phone": [[1, 2]] } });
    const confirmedGapPeer = event("bob-phone", 1, { coverage: { "alice-phone": [[1, 1]] } });
    const legacyPeer = event("carol-phone", 2, { vv: { "alice-phone": 2 } });

    expect(isEventCoveredByEveryKnownDevice([target, confirmedGapPeer, legacyPeer], target)).toBe("not-covered");
  });

  it("returns unknown for a lone event with neither vv nor coverage attached, never covered by default", () => {
    const own = event("solo", 1);
    expect(isEventCoveredByEveryKnownDevice([own], own)).toBe("unknown");
  });

  it("latestCoverageByDevice maps a device with no coverage-bearing latest event to undefined, distinct from an empty coverage record", () => {
    const legacyOnly = event("bob-phone", 1, { vv: { "bob-phone": 1 } });
    const withCoverage = event("alice-phone", 1, { coverage: { "alice-phone": [[1, 1]] } });
    const byDevice = latestCoverageByDevice([legacyOnly, withCoverage]);
    expect(byDevice.get("bob-phone")).toBeUndefined();
    expect(byDevice.get("alice-phone")).toEqual({ "alice-phone": [[1, 1]] });
  });

  it("latestVersionVectorsByDevice (legacy, unchanged) still falls back to an event's own counter for devices with no attached vector", () => {
    const own = event("solo", 1);
    expect(latestVersionVectorsByDevice([own]).get("solo")).toEqual({ solo: 1 });
  });
});
