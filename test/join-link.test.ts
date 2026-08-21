import { describe, expect, it } from "vitest";
import { buildJoinLink, decodeJoinSeed, encodeJoinSeed, type JoinTokenSeed } from "@/lib/join-link";

const seed: JoinTokenSeed = {
  secretB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  tagHex: "a".repeat(64),
  name: "Trip",
  currency: "USD",
};

describe("join token sharing", () => {
  it("keeps the join token in the URL fragment and round-trips the seed", () => {
    const link = buildJoinLink("https://example.test/app?x=1#old", seed);
    const url = new URL(link);
    const encoded = new URLSearchParams(url.hash.slice(1)).get("join");

    expect(url.search).toBe("?x=1");
    expect(url.hash.startsWith("#join=")).toBe(true);
    expect(url.search).not.toContain(seed.secretB64);
    expect(encoded).toBe(encodeJoinSeed(seed));
    expect(decodeJoinSeed(encoded!)).toEqual(seed);
  });
});
