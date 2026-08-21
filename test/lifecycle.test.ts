import { describe, expect, it } from "vitest";
import type { Event } from "@theprawnsplit/core";
import {
  archiveConfirmationText,
  canEditGroupProfile,
  createArchiveTransitionPlan,
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
    expect(text).toContain("ledger export will download");
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

  it("derives settled only for active groups whose canonical balances are zero", () => {
    expect(isSettledViewPredicate(new Map([["p_alice", 0n], ["p_bob", 0n]]), false)).toBe(true);
    expect(isSettledViewPredicate(new Map([["p_alice", 1n], ["p_bob", -1n]]), false)).toBe(false);
    expect(isSettledViewPredicate(new Map([["p_alice", 0n], ["p_bob", 0n]]), true)).toBe(false);
  });

  it("locks profile edits while the group is archived", () => {
    expect(canEditGroupProfile(false)).toBe(true);
    expect(canEditGroupProfile(true)).toBe(false);
  });

  it("stops polling when archived or hidden and applies active/idle cadence otherwise", () => {
    const base = {
      hasGroup: true,
      documentHidden: false,
      archived: false,
      now: 20_000,
      lastActivityAt: 19_000,
      lastSyncAt: 12_000,
      idleAfterMs: 5_000,
      pollActiveMs: 10_000,
      pollIdleMs: 60_000,
    };

    expect(shouldPollGroup({ ...base, archived: true })).toBe(false);
    expect(shouldPollGroup({ ...base, documentHidden: true })).toBe(false);
    expect(shouldPollGroup(base)).toBe(false);
    expect(shouldPollGroup({ ...base, lastSyncAt: 9_000 })).toBe(true);
    expect(shouldPollGroup({ ...base, lastActivityAt: 0, lastSyncAt: 0 })).toBe(false);
    expect(shouldPollGroup({ ...base, now: 70_000, lastActivityAt: 0, lastSyncAt: 0 })).toBe(true);
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
