import { describe, expect, it } from "vitest";
import { assertLowercaseGroupTag, nostrEventTemplate, nostrFetchFilter } from "@/relay/nostr";

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
  });

  it("rejects uppercase, short, and multi-character tag-addressing inputs", () => {
    expect(() => assertLowercaseGroupTag(tag)).not.toThrow();
    expect(() => assertLowercaseGroupTag("A".repeat(64))).toThrow("invalid lowercase group tag");
    expect(() => assertLowercaseGroupTag("a".repeat(63))).toThrow("invalid lowercase group tag");
    expect(nostrEventTemplate(tag, "ciphertext", 1512).tags.some(([name]) => name !== "t" && name !== "s")).toBe(false);
  });
});
