// PERF-002 (T56): buildVerificationContext must reuse immutable signature
// results across refreshes and NOT re-run verifyClaim for every candidate key
// on every call. The cache is keyed by (groupTag, alg, publicKey, payload,
// signature) — all immutable inputs — so authority state (voids/revocations)
// changes take effect immediately via the fold, while raw crypto results are
// stable and reusable. Cache is bounded via LRU eviction.
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Event } from "@theprawnsplit/core";
import { mintClaimKey, signClaim } from "@/crypto/claim";

// Import the module under test lazily so we can spy on verifyClaim through
// the barrel `@/crypto/claim` (which is exactly what verification.ts uses).
import * as claimModule from "@/crypto/claim";

const groupTag = "a".repeat(64);

function event<T extends Event["t"]>(
  t: T,
  id: string,
  payload: Omit<Extract<Event, { t: T }>, "t" | "v" | "id" | "hlc" | "dev">,
): Extract<Event, { t: T }> {
  return {
    v: 1,
    id,
    hlc: { wall: Number(id.split(":")[1] ?? 1), ctr: Number(id.split(":")[1] ?? 1), dev: id.split(":")[0] ?? "dev" },
    dev: id.split(":")[0] ?? "dev",
    t,
    ...payload,
  } as Extract<Event, { t: T }>;
}

describe("PERF-002: verification signature cache", () => {
  beforeEach(async () => {
    const mod = await import("@/lib/verification");
    if (typeof (mod as { resetSignatureCache?: () => void }).resetSignatureCache === "function") {
      (mod as { resetSignatureCache: () => void }).resetSignatureCache();
    }
    vi.restoreAllMocks();
  });

  it("reuses raw crypto results across refreshes on identical events", async () => {
    const key = await mintClaimKey("ecdsa-p256");
    const claimSig = await signClaim(key.privateJwk, key.alg, `${groupTag}:alice:alice-phone:${key.publicKey}`);
    const events: Event[] = [
      event("ParticipantClaimed", "alice-phone:1", {
        pid: "alice",
        deviceId: "alice-phone",
        claimPk: key.publicKey,
        alg: key.alg,
        sig: claimSig,
      }),
    ];

    const { buildVerificationContext } = await import("@/lib/verification");
    const spy = vi.spyOn(claimModule, "verifyClaim");

    await buildVerificationContext({ tagHex: groupTag, events });
    const firstCount = spy.mock.calls.length;
    expect(firstCount).toBeGreaterThan(0);

    await buildVerificationContext({ tagHex: groupTag, events });
    const secondCount = spy.mock.calls.length;

    // Second refresh with identical events must not re-verify.
    expect(secondCount).toBe(firstCount);
  });

  it("re-runs verifyClaim when a new signed event arrives", async () => {
    const key = await mintClaimKey("ecdsa-p256");
    const claimSig = await signClaim(key.privateJwk, key.alg, `${groupTag}:alice:alice-phone:${key.publicKey}`);
    const confirmSig = await signClaim(key.privateJwk, key.alg, `${groupTag}:confirm:s1`);
    const eventsA: Event[] = [
      event("ParticipantClaimed", "alice-phone:1", {
        pid: "alice",
        deviceId: "alice-phone",
        claimPk: key.publicKey,
        alg: key.alg,
        sig: claimSig,
      }),
    ];
    const eventsB: Event[] = [
      ...eventsA,
      event("SettlementRecorded", "bob-phone:1", { sid: "s1", from: "bob", to: "alice", minor: 100n }),
      event("SettlementConfirmed", "alice-phone:2", { sid: "s1", pid: "alice", claimSig: confirmSig }),
    ];

    const { buildVerificationContext } = await import("@/lib/verification");
    const spy = vi.spyOn(claimModule, "verifyClaim");

    await buildVerificationContext({ tagHex: groupTag, events: eventsA });
    const afterA = spy.mock.calls.length;

    await buildVerificationContext({ tagHex: groupTag, events: eventsB });
    const afterB = spy.mock.calls.length;

    // The new SettlementConfirmed event must trigger at least one new verifyClaim.
    expect(afterB).toBeGreaterThan(afterA);
  });

  it("does not reuse cached results across different group tags", async () => {
    const key = await mintClaimKey("ecdsa-p256");
    const claimSig = await signClaim(key.privateJwk, key.alg, `${groupTag}:alice:alice-phone:${key.publicKey}`);
    const events: Event[] = [
      event("ParticipantClaimed", "alice-phone:1", {
        pid: "alice",
        deviceId: "alice-phone",
        claimPk: key.publicKey,
        alg: key.alg,
        sig: claimSig,
      }),
    ];

    const { buildVerificationContext } = await import("@/lib/verification");
    const spy = vi.spyOn(claimModule, "verifyClaim");

    await buildVerificationContext({ tagHex: groupTag, events });
    const firstCount = spy.mock.calls.length;

    // Same events, different group tag — cache key differs, must re-verify.
    await buildVerificationContext({ tagHex: "b".repeat(64), events });
    const secondCount = spy.mock.calls.length;

    expect(secondCount).toBeGreaterThan(firstCount);
  });
});
