import { describe, expect, it } from "vitest";
import type { Event } from "@theprawnsplit/core";
import {
  archiveConfirmationText,
  canEditGroupProfile,
  createArchiveTransitionPlan,
  groupWithPendingArchiveEvent,
  isSettledViewPredicate,
  latestArchiveEvent,
  shouldPollGroup,
  unarchiveConfirmationText,
} from "@/lib/lifecycle";

type ArchiveOutstanding = Extract<Event, { t: "GroupArchived" }>["outstanding"];

function event(id: string, ctr: number, t: "GroupArchived", outstanding: ArchiveOutstanding): Event;
function event(id: string, ctr: number, t: "GroupUnarchived"): Event;
function event(id: string, ctr: number, t: "GroupArchived" | "GroupUnarchived", outstanding: ArchiveOutstanding = []): Event {
  const base = {
    id,
    v: 1,
    hlc: { wall: 1_787_247_200_000, ctr, dev: "d_test" },
    dev: "d_test",
    vv: { d_test: ctr },
  };
  return t === "GroupArchived" ? { ...base, t, outstanding } : { ...base, t };
}

describe("lifecycle copy", () => {
  it("names outstanding balances and states relay data is not deleted on archive", () => {
    const text = archiveConfirmationText(["Bob pays Alice USD 12.00"]);

    expect(text).toContain("Bob pays Alice USD 12.00");
    expect(text).toContain("ledger export containing the archive event will download");
    expect(text).toContain("does not delete relay data");
  });

  it("requires explicit unarchive confirmation copy", () => {
    expect(unarchiveConfirmationText()).toContain("Unarchive this trip?");
    expect(unarchiveConfirmationText()).toContain("editable again");
  });

  it("plans archive export before recording the archive event with copied outstanding balances", () => {
    const outstanding = [{ from: "p_bob", to: "p_alice", minor: 1200n }];
    const plan = createArchiveTransitionPlan(outstanding);
    outstanding[0]!.minor = 1n;

    expect(plan.actions).toEqual(["download-export", "append-archive-event"]);
    expect(plan.outstanding).toEqual([{ from: "p_bob", to: "p_alice", minor: 1200n }]);
  });

  it("builds an automatic archive export view that already contains the archive event", () => {
    const group = { events: [event("e_archive_1", 1, "GroupArchived", [])], nextCounter: 2, name: "Trip" };
    const archive = event("e_archive_2", 2, "GroupArchived", [{ from: "p_bob", to: "p_alice", minor: 1200n }]) as Extract<
      Event,
      { t: "GroupArchived" }
    >;
    const exportView = groupWithPendingArchiveEvent(group, archive, 3);

    expect(exportView).not.toBe(group);
    expect(exportView.events.map((candidate) => candidate.id)).toEqual(["e_archive_1", "e_archive_2"]);
    expect(group.events.map((candidate) => candidate.id)).toEqual(["e_archive_1"]);
    expect(exportView.nextCounter).toBe(3);
  });

  it("derives settled only for active groups whose canonical balances are zero", () => {
    expect(isSettledViewPredicate(new Map([["p_alice", 0n], ["p_bob", 0n]]), false)).toBe(true);
    expect(isSettledViewPredicate(new Map([["p_alice", 1n], ["p_bob", -1n]]), false)).toBe(false);
    expect(isSettledViewPredicate(new Map([["p_alice", 0n], ["p_bob", 0n]]), true)).toBe(false);
  });

  it("locks profile edits while the group is archived", () => {
    expect(canEditGroupProfile(false)).toBe(true);
    expect(canEditGroupProfile(true)).toBe(false);
  });

  it("stops polling when archived or hidden and applies active/backoff/idle cadence otherwise", () => {
    const base = {
      hasGroup: true,
      documentHidden: false,
      archived: false,
      now: 180_000,
      lastActivityAt: 175_000,
      lastSyncAt: 171_000,
      idleAfterMs: 120_000,
      pollActiveMs: 10_000,
      pollBackoffMs: 60_000,
      pollIdleMs: 120_000,
    };

    expect(shouldPollGroup({ ...base, archived: true })).toBe(false);
    expect(shouldPollGroup({ ...base, documentHidden: true })).toBe(false);
    expect(shouldPollGroup(base)).toBe(false);
    expect(shouldPollGroup({ ...base, lastSyncAt: 169_000 })).toBe(true);

    expect(shouldPollGroup({ ...base, lastActivityAt: 120_000, lastSyncAt: 125_000 })).toBe(false);
    expect(shouldPollGroup({ ...base, lastActivityAt: 120_000, lastSyncAt: 119_000 })).toBe(true);

    expect(shouldPollGroup({ ...base, lastActivityAt: 0, lastSyncAt: 70_000 })).toBe(false);
    expect(shouldPollGroup({ ...base, lastActivityAt: 0, lastSyncAt: 59_000 })).toBe(true);
  });

  it("uses exact adaptive polling boundaries from active to backoff to idle", () => {
    const base = {
      hasGroup: true,
      documentHidden: false,
      archived: false,
      now: 200_000,
      lastActivityAt: 190_000,
      lastSyncAt: 190_001,
      idleAfterMs: 120_000,
      pollActiveMs: 10_000,
      pollBackoffMs: 60_000,
      pollIdleMs: 120_000,
    };

    expect(shouldPollGroup({ ...base, hasGroup: false })).toBe(false);
    expect(shouldPollGroup(base)).toBe(false);
    expect(shouldPollGroup({ ...base, lastSyncAt: 190_000 })).toBe(true);

    expect(shouldPollGroup({ ...base, lastActivityAt: 189_999, lastSyncAt: 140_001 })).toBe(false);
    expect(shouldPollGroup({ ...base, lastActivityAt: 189_999, lastSyncAt: 140_000 })).toBe(true);
    expect(shouldPollGroup({ ...base, lastActivityAt: 80_000, lastSyncAt: 140_001 })).toBe(false);
    expect(shouldPollGroup({ ...base, lastActivityAt: 80_000, lastSyncAt: 140_000 })).toBe(true);

    expect(shouldPollGroup({ ...base, lastActivityAt: 79_999, lastSyncAt: 80_001 })).toBe(false);
    expect(shouldPollGroup({ ...base, lastActivityAt: 79_999, lastSyncAt: 80_000 })).toBe(true);
  });

  it("returns the archive event that currently controls archived display", () => {
    const first = event("e_archive_1", 1, "GroupArchived", [{ from: "p_bob", to: "p_alice", minor: 1200n }]);
    const unarchive = event("e_unarchive_2", 2, "GroupUnarchived");
    const second = event("e_archive_3", 3, "GroupArchived", []);

    expect(latestArchiveEvent([first])?.id).toBe("e_archive_1");
    expect(latestArchiveEvent([first, unarchive])).toBeUndefined();
    expect(latestArchiveEvent([second, first, unarchive])?.id).toBe("e_archive_3");
  });
});
