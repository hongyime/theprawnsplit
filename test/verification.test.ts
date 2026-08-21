import { fold, type Event } from "@theprawnsplit/core";
import { describe, expect, it } from "vitest";
import { mintClaimKey, signClaim } from "@/crypto/claim";
import { buildVerificationContext } from "@/lib/verification";

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

describe("app verification context", () => {
  it("lets the browser fold honour real claim and settlement confirmation signatures", async () => {
    const key = await mintClaimKey("ecdsa-p256");
    const claimSig = await signClaim(key.privateJwk, key.alg, `${groupTag}:alice:alice-phone:${key.publicKey}`);
    const confirmSig = await signClaim(key.privateJwk, key.alg, `${groupTag}:confirm:s1`);
    const events: Event[] = [
      event("ParticipantClaimed", "alice-phone:1", {
        pid: "alice",
        deviceId: "alice-phone",
        claimPk: key.publicKey,
        alg: key.alg,
        sig: claimSig,
      }),
      event("SettlementRecorded", "bob-phone:1", { sid: "s1", from: "bob", to: "alice", minor: 100n }),
      event("SettlementConfirmed", "alice-phone:2", { sid: "s1", pid: "alice", claimSig: confirmSig }),
    ];

    const ctx = await buildVerificationContext({ tagHex: groupTag, events });
    const state = fold(events, { supportedVersion: 1 }, ctx);

    expect(state.settlements.get("s1")?.confirmed).toBe(true);
    expect(state.settlements.get("s1")?.pending).toBe(false);
  });

  it("lets a peer re-attest a recovered device with real signatures", async () => {
    const oldKey = await mintClaimKey("ecdsa-p256");
    const recoveredKey = await mintClaimKey("ecdsa-p256");
    const peerKey = await mintClaimKey("ecdsa-p256");
    const oldClaimSig = await signClaim(oldKey.privateJwk, oldKey.alg, `${groupTag}:alice:old-phone:${oldKey.publicKey}`);
    const recoveredClaimSig = await signClaim(recoveredKey.privateJwk, recoveredKey.alg, `${groupTag}:alice:recovered-phone:${recoveredKey.publicKey}`);
    const peerClaimSig = await signClaim(peerKey.privateJwk, peerKey.alg, `${groupTag}:bob:bob-phone:${peerKey.publicKey}`);
    const reattestSig = await signClaim(peerKey.privateJwk, peerKey.alg, `${groupTag}:reattest:alice:recovered-phone:${recoveredKey.publicKey}`);
    const confirmSig = await signClaim(recoveredKey.privateJwk, recoveredKey.alg, `${groupTag}:confirm:s1`);
    const events: Event[] = [
      event("ParticipantClaimed", "old-phone:1", {
        pid: "alice",
        deviceId: "old-phone",
        claimPk: oldKey.publicKey,
        alg: oldKey.alg,
        sig: oldClaimSig,
      }),
      event("ParticipantClaimed", "recovered-phone:1", {
        pid: "alice",
        deviceId: "recovered-phone",
        claimPk: recoveredKey.publicKey,
        alg: recoveredKey.alg,
        sig: recoveredClaimSig,
      }),
      event("ParticipantClaimed", "bob-phone:1", {
        pid: "bob",
        deviceId: "bob-phone",
        claimPk: peerKey.publicKey,
        alg: peerKey.alg,
        sig: peerClaimSig,
      }),
      event("SettlementRecorded", "bob-phone:2", { sid: "s1", from: "bob", to: "alice", minor: 100n }),
      event("ClaimReattested", "bob-phone:3", {
        pid: "alice",
        newDevice: "recovered-phone",
        newClaimPk: recoveredKey.publicKey,
        alg: recoveredKey.alg,
        attestor: "bob",
        sig: reattestSig,
      }),
      event("SettlementConfirmed", "recovered-phone:4", { sid: "s1", pid: "alice", claimSig: confirmSig }),
    ];

    const ctx = await buildVerificationContext({ tagHex: groupTag, events });
    const state = fold(events, { supportedVersion: 1 }, ctx);

    expect(state.anomalies.map((anomaly) => anomaly.code)).not.toContain("contested-participant-claim");
    expect(state.settlements.get("s1")?.confirmed).toBe(true);
    expect(state.settlements.get("s1")?.pending).toBe(false);
  });
});
