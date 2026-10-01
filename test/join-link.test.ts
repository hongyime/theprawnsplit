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

  it("round-trips ASCII, CJK and emoji names without throwing", () => {
    for (const name of ["Trip", "\u65e5\u672c\u65c5\u884c", "Party \ud83c\udf89 Trip"]) {
      const withName: JoinTokenSeed = { ...seed, name };
      expect(() => encodeJoinSeed(withName)).not.toThrow();
      expect(decodeJoinSeed(encodeJoinSeed(withName))).toEqual(withName);
    }
  });

  it("decodes a legacy token whose accented name was encoded as raw Latin1 bytes by btoa", () => {
    const legacySeed: JoinTokenSeed = { ...seed, name: "Caf\u00e9 Trip" };
    const legacyEncoded = btoa(JSON.stringify(legacySeed)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    expect(decodeJoinSeed(legacyEncoded)).toEqual(legacySeed);
  });

  it("throws a clear error for malformed or wrong-shaped tokens instead of an unhandled parse error", () => {
    expect(() => decodeJoinSeed("not-valid-base64!!!")).toThrow();
    expect(() => decodeJoinSeed(btoa(JSON.stringify({ onlyName: "nope" })))).toThrow();
    expect(() => decodeJoinSeed(btoa("not json at all"))).toThrow();
  });
});
