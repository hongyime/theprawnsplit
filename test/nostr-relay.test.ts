import { describe, expect, it } from "vitest";
import { assertLowercaseGroupTag, nostrEventTemplate, nostrFetchFilter, selectNostrEntries } from "@/relay/nostr";

const tag = "a".repeat(64);

describe("Nostr relay envelope", () => {
  it("uses single-letter lowercase group tags for publish and fetch", () => {
    expect(nostrEventTemplate(tag, "ciphertext", 1512, 1_787_280_000_123)).toEqual({
      kind: 1512,
      created_at: 1_787_280_000,
      tags: [
        ["t", tag],
        ["s", "1787280000123"],
      ],
      content: "ciphertext",
    });
    expect(nostrFetchFilter(tag, 1512, { author: "pubkey", limit: 25 })).toEqual({
      kinds: [1512],
      "#t": [tag],
      authors: ["pubkey"],
      limit: 25,
    });
    expect(nostrFetchFilter(tag, 1512, { since: 105 })).toMatchObject({ since: 105 });
  });

  it("rejects uppercase, short, and multi-character tag-addressing inputs", () => {
    expect(() => assertLowercaseGroupTag(tag)).not.toThrow();
    expect(() => assertLowercaseGroupTag("A".repeat(64))).toThrow("invalid lowercase group tag");
    expect(() => assertLowercaseGroupTag("a".repeat(63))).toThrow("invalid lowercase group tag");
    expect(nostrEventTemplate(tag, "ciphertext", 1512).tags.some(([name]) => name !== "t" && name !== "s")).toBe(false);
  });
});

describe("Nostr fetch cursor (CR-012)", () => {
  const nostrEvent = (id: string, created_at: number, content: string) => ({ id, created_at, content, pubkey: "pk" });

  // Deterministic sha256-like hex ids. Round 1 is fetched without a cursor and
  // sync persists the cursor of its newest entry. Round 2 contains EIGHT brand-new
  // events created strictly after round 1. Under the OLD id-based cursor, the
  // RED run discarded ALL EIGHT (the stored id `f000…` outranks every round-2 id);
  // with a mid-range stored id roughly half would go missing.
  const ROUND1 = [
    nostrEvent("1a9926001a992600", 101, "e1"),
    nostrEvent("283c1500283c1500", 102, "e2"),
    nostrEvent("4dd1acc04dd1acc0", 103, "e3"),
    nostrEvent("57d8590057d85900", 104, "e4"),
    nostrEvent("f0000000f0000000", 105, "e5"), // newest; becomes the stored watermark "105"
  ];
  const ROUND2 = [
    nostrEvent("0dd0e8300dd0e830", 106, "n1"), // id sorts below old cursor → was dropped
    nostrEvent("2dfb21002dfb2100", 107, "n2"), // below
    nostrEvent("2e2b0e002e2b0e00", 108, "n3"), // below
    nostrEvent("35f4d10035f4d100", 109, "n4"), // below
    nostrEvent("36eb2d0036eb2d00", 110, "n5"), // below
    nostrEvent("9abc12349abc1234", 111, "n6"),
    nostrEvent("bdef5678bdef5678", 112, "n7"),
    nostrEvent("e1234567e1234567", 113, "n8"),
  ];

  it("returns a created_at watermark, not an event id", () => {
    const round1 = selectNostrEntries(ROUND1, {});
    expect(round1.at(-1)?.cursor).toBe("105");
  });

  it("keeps every event created after the watermark regardless of hex-id order", () => {
    // Watermark "105": all eight round-2 events are new. The RED run against the
    // old id-based filter returned [] — 8 of 8 fresh events dropped.
    const round2 = selectNostrEntries(ROUND2, { since: 105 });
    expect(round2.map((entry) => entry.blob).sort()).toEqual(["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"]);
    expect(round2.map((entry) => entry.cursor)).toEqual(["106", "107", "108", "109", "110", "111", "112", "113"]);
  });

  it("dedupes repeated ids within one response (pool merge / boundary second)", () => {
    const duplicate = ROUND2[0];
    if (!duplicate) throw new Error("fixture empty");
    const withDuplicate = [...ROUND2, duplicate];
    const round2 = selectNostrEntries(withDuplicate, { since: 105 });
    expect(round2).toHaveLength(8);
  });
});
