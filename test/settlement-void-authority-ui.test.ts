// SEC-002/T47 — source-shape guard for Trip.svelte's voidSettlement.
// core/src/identity.ts's verifySettlementVoid and core/src/fold.ts's
// settlementVoidDecisions have full behavioral coverage in
// core/test/identity.test.ts and core/test/fold.test.ts; this file pins
// that Trip.svelte's UI-layer orchestration signs the void with a
// genuinely usable local identity (any current group member this device
// holds, per design.md §B2) instead of ever fabricating or omitting a
// signature -- the literal UI-side fix replacing the removed unsigned
// device-matching guard.
// Evidence for all assertions in this file: source-shape.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "Trip.svelte"), "utf8");
}

describe("SEC-002/T47 settlement void authority UI boundary", () => {
  it("signs SettlementVoided with a genuinely usable local identity's own claim key, never a bare device-string attribution", () => {
    const source = appSource();
    const voidSettlement = source.match(/async function voidSettlement\(sid: string\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";

    // Gated on the SAME canVoidRecordedSettlement guard the UI's render
    // check uses, never on a device-id match.
    expect(voidSettlement).toContain("const localPids = group.identities.map((identity) => identity.pid);");
    expect(voidSettlement).toContain("canVoidRecordedSettlement(group.events, sid, localPids, verificationContext)");
    expect(voidSettlement).toContain("usableVoidAuthorityPid(group.events, localPids, verificationContext)");
    expect(voidSettlement).toContain("await signClaim(identity.claimSkJwk, identity.alg, `${group.tagHex}:void-settlement:${sid}`)");
    expect(voidSettlement).toContain('makeEvent(f, "SettlementVoided", { sid, pid: votingPid, sig: claimSig })');
    // The old bare, unsigned SettlementVoided({ sid }) construction must be
    // fully gone -- never merely shadowed by the new signed path above.
    expect(voidSettlement).not.toContain('makeEvent(f, "SettlementVoided", { sid })');
  });

  it("gates the rendered Void action on the SAME any-current-group-member authority the signing path uses", () => {
    const source = appSource();
    expect(source).toContain(
      "{#if verificationContext && canVoidRecordedSettlement(group.events, settlement.sid, group.identities.map((identity) => identity.pid), verificationContext)}",
    );
    // The old device-matching guard (group.deviceId as the 3rd argument)
    // must be fully removed.
    expect(source).not.toContain("canVoidRecordedSettlement(group.events, settlement.sid, group.deviceId)");
  });
});
