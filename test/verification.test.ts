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
});
