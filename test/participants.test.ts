import { describe, expect, it } from "vitest";
import {
  claimAttributionText,
  defaultPayerPid,
  defaultSplitSelection,
  findParticipantNameMatch,
  groupParticipantsForClaim,
  levenshteinDistance,
  normalizeParticipantName,
} from "@/lib/participants";

const people = [
  { pid: "alice", name: "Alice Tan" },
  { pid: "jose", name: "Jose Lee" },
  { pid: "charlie", name: "Charlie" },
];

describe("participant name matching", () => {
  it("normalizes case, accents, and whitespace", () => {
    expect(normalizeParticipantName("  J\u00f3se   Lee ")).toBe("joselee");
    expect(findParticipantNameMatch("  J\u00f3se   Lee ", people)).toMatchObject({ pid: "jose", kind: "exact" });
  });

  it("matches by normalized prefix in either direction", () => {
    expect(findParticipantNameMatch("Alice", people)).toMatchObject({ pid: "alice", kind: "prefix" });
    expect(findParticipantNameMatch("Charlie Lim", people)).toMatchObject({ pid: "charlie", kind: "prefix" });
  });

  it("matches small edit distance", () => {
    expect(levenshteinDistance("alicetan", "alicetn")).toBe(1);
    expect(findParticipantNameMatch("Alic Tn", people)).toMatchObject({ pid: "alice", kind: "levenshtein" });
  });

  it("does not match distant names", () => {
    expect(findParticipantNameMatch("Beatrice", people)).toBeUndefined();
  });

  it("orders claimable people before already claimed people", () => {
    const groups = groupParticipantsForClaim([
      { pid: "claimed", name: "Claimed", devices: ["phone"] },
      { pid: "shadow", name: "Shadow", devices: [] },
      { pid: "also-shadow", name: "Also Shadow", devices: [] },
    ]);

    expect(groups.unclaimed.map((person) => person.pid)).toEqual(["shadow", "also-shadow"]);
    expect(groups.claimed.map((person) => person.pid)).toEqual(["claimed"]);
  });

  it("removes deactivated participants from default split selection without changing active manual choices", () => {
    const selected = defaultSplitSelection(
      [
        { pid: "active", deactivated: false },
        { pid: "manually-off", deactivated: false },
        { pid: "inactive", deactivated: true },
      ],
      { "manually-off": false, inactive: true },
    );

    expect(selected).toEqual({ active: true, "manually-off": false, inactive: false });
  });

  it("defaults the payer to a local claimed participant for the common paid-by-self expense", () => {
    const participants = [{ pid: "shadow" }, { pid: "self" }, { pid: "other" }];

    expect(defaultPayerPid(participants, "", new Set(["self"]))).toBe("self");
    expect(defaultPayerPid(participants, "other", new Set(["self"]))).toBe("other");
    expect(defaultPayerPid(participants, "missing", new Set(["self"]))).toBe("self");
    expect(defaultPayerPid(participants, "", new Set())).toBe("shadow");
  });

  it("renders TOFU claim attribution with device, time, and current balance", () => {
    expect(
      claimAttributionText({
        name: "Ben",
        device: "another device",
        claimedAt: "Aug 21, 2026, 8:30 PM",
        balance: "USD 12.00",
      }),
    ).toBe("Ben was claimed by another device on Aug 21, 2026, 8:30 PM. Current balance: USD 12.00.");
  });
});
