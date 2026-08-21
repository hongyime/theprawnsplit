import { describe, expect, it } from "vitest";
import { findParticipantNameMatch, levenshteinDistance, normalizeParticipantName } from "@/lib/participants";

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
});
