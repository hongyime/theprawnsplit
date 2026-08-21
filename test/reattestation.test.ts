import { describe, expect, it } from "vitest";
import type { Event } from "@theprawnsplit/core";
import { reattestationStatus, reattestationThreshold } from "@/lib/reattestation";

const claim = (attestor: string): Event =>
  ({
    v: 1,
    id: `${attestor}:1`,
    hlc: { wall: 1, ctr: 1, dev: attestor },
    dev: attestor,
    t: "ClaimReattested",
    pid: "alice",
    newDevice: "recovered",
    newClaimPk: "recovered-key",
    alg: "ecdsa-p256",
    attestor,
    sig: "sig",
  }) as Event;

describe("re-attestation display status", () => {
  it("uses the PRD majority threshold formula", () => {
    expect([0, 1, 2, 3, 4, 5].map(reattestationThreshold)).toEqual([1, 1, 1, 2, 2, 3]);
  });

  it("counts distinct matching attestors and exposes the small-group caveat", () => {
    const status = reattestationStatus({
      targetPid: "alice",
      newDevice: "recovered",
      newClaimPk: "recovered-key",
      participants: [
        { pid: "alice", devices: ["old"] },
        { pid: "bob", devices: ["bob-phone"] },
        { pid: "cara", devices: ["cara-phone"] },
      ],
      events: [claim("bob"), claim("bob")],
    });

    expect(status).toMatchObject({ claimedPeerCount: 2, threshold: 1, attestedCount: 1 });
    expect(status.caveat).toContain("Small group caveat");
  });
});
