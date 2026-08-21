import { describe, expect, it } from "vitest";
import type { Event } from "@theprawnsplit/core";
import { isEventCoveredByEveryKnownDevice, latestVersionVectorsByDevice } from "@/lib/sync-coverage";

function event(dev: string, ctr: number, vv?: Record<string, number>): Event {
  return {
    v: 1,
    id: `${dev}:${ctr}`,
    hlc: { wall: ctr, ctr, dev },
    dev,
    t: "ParticipantAdded",
    pid: `${dev}-person`,
    name: dev,
    ...(vv ? { vv } : {}),
  };
}

describe("REQ-SYN-10 delivery coverage", () => {
  it("requires every known device's latest version vector to cover the target event", () => {
    const target = event("alice-phone", 2, { "alice-phone": 2 });
    const stalePeer = event("bob-phone", 1, { "alice-phone": 1, "bob-phone": 1 });

    expect(isEventCoveredByEveryKnownDevice([target, stalePeer], target)).toBe(false);

    const caughtUpPeer = event("bob-phone", 2, { "alice-phone": 2, "bob-phone": 2 });
    expect(isEventCoveredByEveryKnownDevice([target, stalePeer, caughtUpPeer], target)).toBe(true);
  });

  it("falls back to an event's own counter only for devices with no attached vector", () => {
    const own = event("solo", 1);
    expect(latestVersionVectorsByDevice([own]).get("solo")).toEqual({ solo: 1 });
    expect(isEventCoveredByEveryKnownDevice([own], own)).toBe(true);
  });
});
