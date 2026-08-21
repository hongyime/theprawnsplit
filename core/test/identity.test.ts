import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authorisedKeys, buildDSU, claimAnomalies, contestedClaimPids, matchesPayeeClaimSignature, verifyConfirmation } from "../src/identity";
import { base, claim, confirm, groupTag, link, sig, verifier } from "./helpers";

describe("REQ-ID-13/REQ-SEC-08 identity", () => {
  it("does not assume a default claim-signature algorithm while verifying", () => {
    const source = readFileSync("src/identity.ts", "utf8");

    expect(source).not.toContain('?? "ed25519"');
    expect(source).not.toContain('|| "ed25519"');
  });

  it("rebuilds DSU with lowest canonical root regardless of merge direction", () => {
    const dsu = buildDSU([
      base("ParticipantMerged", { from: "mallory", into: "alice" } as never),
      base("ParticipantMerged", { from: "bob", into: "mallory" } as never),
    ]);
    expect(dsu.get("mallory")).toBe("alice");
    expect(dsu.get("bob")).toBe("alice");
  });

  it("converges transitive DeviceLinked authority under shuffled arrival", () => {
    const genesis = claim("alice", "phone", "key-a");
    const tablet = link("alice", "key-a", "tablet", "key-b", "n1");
    const laptopPayload = `${groupTag}:link:alice:laptop:key-c:n2`;
    const laptop = base("DeviceLinked", {
      pid: "alice",
      parentDevice: "tablet",
      newDevice: "laptop",
      newClaimPk: "key-c",
      alg: "ed25519",
      nonce: "n2",
      sig: sig("key-b", laptopPayload),
    } as never);
    expect([...authorisedKeys([laptop, tablet, genesis], "alice", verifier)]).toEqual(["key-a", "key-b", "key-c"]);
  });

  it("does not let unsigned merge transfer settlement confirmation authority", () => {
    const events = [
      claim("alice", "phone", "alice-key"),
      claim("mallory", "mallory-phone", "mallory-key"),
      base("ParticipantMerged", { from: "alice", into: "mallory" } as never),
      base("SettlementRecorded", { sid: "s1", from: "mallory", to: "alice", minor: 10n } as never),
    ];
    const malloryConfirm = confirm("s1", "mallory-key");
    const aliceConfirm = confirm("s1", "alice-key");
    if (malloryConfirm.t !== "SettlementConfirmed" || aliceConfirm.t !== "SettlementConfirmed") {
      throw new Error("test helper returned wrong event type");
    }
    expect(verifyConfirmation([...events, malloryConfirm], "s1", malloryConfirm.claimSig, verifier)).toBe(false);
    expect(verifyConfirmation([...events, aliceConfirm], "s1", aliceConfirm.claimSig, verifier)).toBe(true);
  });

  it("requires the confirmation pid to match the literal settlement payee", () => {
    const events = [
      claim("alice", "phone", "alice-key"),
      base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 10n } as never),
    ];
    const aliceConfirm = confirm("s1", "alice-key");
    if (aliceConfirm.t !== "SettlementConfirmed") throw new Error("test helper returned wrong event type");

    expect(verifyConfirmation([...events, aliceConfirm], "s1", aliceConfirm.claimSig, verifier, "alice")).toBe(true);
    expect(verifyConfirmation([...events, aliceConfirm], "s1", aliceConfirm.claimSig, verifier, "mallory")).toBe(false);
  });

  it("activates ClaimReattested only after enough single-attestor events accumulate", () => {
    const payloadA = `${groupTag}:reattest:lost:new-phone:lost-new`;
    const payloadB = `${groupTag}:reattest:lost:new-phone:lost-new`;
    const events = [
      claim("peer-a", "a", "peer-a-key"),
      claim("peer-b", "b", "peer-b-key"),
      claim("peer-c", "c", "peer-c-key"),
      base("ClaimReattested", {
        pid: "lost",
        newDevice: "new-phone",
        newClaimPk: "lost-new",
        alg: "ed25519",
        attestor: "peer-a",
        sig: sig("peer-a-key", payloadA),
      } as never),
    ];
    expect([...authorisedKeys(events, "lost", verifier)]).toEqual([]);
    events.push(
      base("ClaimReattested", {
        pid: "lost",
        newDevice: "new-phone",
        newClaimPk: "lost-new",
        alg: "ed25519",
        attestor: "peer-b",
        sig: sig("peer-b-key", payloadB),
      } as never),
    );
    expect([...authorisedKeys(events, "lost", verifier)]).toEqual(["lost-new"]);
  });

  it("requires the re-attestation majority on the same recovered key", () => {
    const keyOnePayloadA = `${groupTag}:reattest:lost:phone-1:lost-key-1`;
    const keyTwoPayloadB = `${groupTag}:reattest:lost:phone-2:lost-key-2`;
    const keyOnePayloadC = `${groupTag}:reattest:lost:phone-1:lost-key-1`;
    const events = [
      claim("peer-a", "a", "peer-a-key"),
      claim("peer-b", "b", "peer-b-key"),
      claim("peer-c", "c", "peer-c-key"),
      base("ClaimReattested", {
        pid: "lost",
        newDevice: "phone-1",
        newClaimPk: "lost-key-1",
        alg: "ed25519",
        attestor: "peer-a",
        sig: sig("peer-a-key", keyOnePayloadA),
      } as never),
      base("ClaimReattested", {
        pid: "lost",
        newDevice: "phone-2",
        newClaimPk: "lost-key-2",
        alg: "ed25519",
        attestor: "peer-b",
        sig: sig("peer-b-key", keyTwoPayloadB),
      } as never),
    ];

    expect([...authorisedKeys(events, "lost", verifier)]).toEqual([]);

    events.push(
      base("ClaimReattested", {
        pid: "lost",
        newDevice: "phone-1",
        newClaimPk: "lost-key-1",
        alg: "ed25519",
        attestor: "peer-c",
        sig: sig("peer-c-key", keyOnePayloadC),
      } as never),
    );

    expect([...authorisedKeys(events, "lost", verifier)]).toEqual(["lost-key-1"]);
  });

  it("flags an unpaired second claim and withholds confirmation authority", () => {
    const events = [
      claim("alice", "phone", "alice-key"),
      claim("alice", "tablet", "tablet-key"),
      base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 10n } as never),
    ];
    const tabletConfirm = confirm("s1", "tablet-key");
    const anomalies = claimAnomalies(events, verifier);

    expect(anomalies.map((anomaly) => anomaly.code)).toContain("unverified-reclaim");
    expect(contestedClaimPids(events, verifier)).toEqual(new Set(["alice"]));
    if (tabletConfirm.t !== "SettlementConfirmed") throw new Error("test helper returned wrong event type");
    expect(verifyConfirmation([...events, tabletConfirm], "s1", tabletConfirm.claimSig, verifier)).toBe(false);
  });

  it("does not surface contested confirmations from invalid delegated keys", () => {
    const forgedPayload = `${groupTag}:link:alice:evil-phone:evil-key:n1`;
    const events = [
      claim("alice", "phone", "alice-key"),
      claim("alice", "tablet", "tablet-key"),
      base("DeviceLinked", {
        pid: "alice",
        parentDevice: "phone",
        newDevice: "evil-phone",
        newClaimPk: "evil-key",
        alg: "ed25519",
        nonce: "n1",
        sig: sig("not-alice-key", forgedPayload),
      } as never),
      base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 10n } as never),
    ];
    const forgedConfirm = confirm("s1", "evil-key");

    expect(contestedClaimPids(events, verifier)).toEqual(new Set(["alice"]));
    if (forgedConfirm.t !== "SettlementConfirmed") throw new Error("test helper returned wrong event type");
    expect(matchesPayeeClaimSignature([...events, forgedConfirm], "s1", forgedConfirm.claimSig, verifier)).toBe(false);
  });

  it("allows DeviceLinked authority without raising a second-claim anomaly", () => {
    const events = [
      claim("alice", "phone", "alice-key"),
      link("alice", "alice-key", "tablet", "tablet-key", "n1"),
      base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 10n } as never),
    ];
    const tabletConfirm = confirm("s1", "tablet-key");

    expect(claimAnomalies(events, verifier).map((anomaly) => anomaly.code)).not.toContain("unverified-reclaim");
    if (tabletConfirm.t !== "SettlementConfirmed") throw new Error("test helper returned wrong event type");
    expect(verifyConfirmation([...events, tabletConfirm], "s1", tabletConfirm.claimSig, verifier)).toBe(true);
  });

  it("allows ClaimReattested authority without raising a second-claim anomaly", () => {
    const payload = `${groupTag}:reattest:alice:recovered:recovered-key`;
    const events = [
      claim("alice", "phone", "alice-key"),
      claim("alice", "recovered", "recovered-key"),
      claim("bob", "bob-phone", "bob-key"),
      base("ClaimReattested", {
        pid: "alice",
        newDevice: "recovered",
        newClaimPk: "recovered-key",
        alg: "ed25519",
        attestor: "bob",
        sig: sig("bob-key", payload),
      } as never),
      base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 10n } as never),
    ];
    const recoveredConfirm = confirm("s1", "recovered-key");

    expect(claimAnomalies(events, verifier).map((anomaly) => anomaly.code)).not.toContain("unverified-reclaim");
    if (recoveredConfirm.t !== "SettlementConfirmed") throw new Error("test helper returned wrong event type");
    expect(verifyConfirmation([...events, recoveredConfirm], "s1", recoveredConfirm.claimSig, verifier)).toBe(true);
  });

  it("flags one device claiming two participants", () => {
    const anomalies = claimAnomalies([claim("alice", "phone", "alice-key"), claim("bob", "phone", "bob-key")], verifier);
    expect(anomalies.filter((anomaly) => anomaly.code === "device-claims-multiple-participants").map((anomaly) => anomaly.pid)).toEqual([
      "alice",
      "bob",
    ]);
  });
});
