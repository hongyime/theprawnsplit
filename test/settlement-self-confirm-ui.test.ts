// SEC-001/T45 — source-shape guard for Trip.svelte's recordSettlement.
// core/src/fold.ts's SettlementConfirmed verification (verifyConfirmation)
// has full behavioral coverage in core/test/fold.test.ts and
// core/test/identity.test.ts; this file pins that Trip.svelte's UI-layer
// orchestration still atomically pairs a genuinely signed SettlementConfirmed
// event with SettlementRecorded whenever this device already holds the
// payee's own local claim identity, and never fabricates a signature when
// it does not -- the literal UI-side fix replacing the removed unsigned
// born-confirmation shortcut in fold.ts.
// Evidence for all assertions in this file: source-shape.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "Trip.svelte"), "utf8");
}

describe("SEC-001/T45 settlement self-confirm UI boundary", () => {
  it("atomically pairs a genuinely signed SettlementConfirmed with SettlementRecorded only when this device holds the payee's own identity with no active claim anomaly", () => {
    const source = appSource();
    const recordSettlement = source.match(/async function recordSettlement\(from: string, to: string, amount: string\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";

    // Never trusts a bare device-string match (the removed fold.ts shortcut
    // this task closes) -- gates on an ACTUAL local claim identity plus the
    // same anomaly check confirmSettlement itself uses.
    expect(recordSettlement).toContain("const payeeIdentity = localIdentityForPid(to);");
    expect(recordSettlement).toContain("!hasActiveClaimAnomaly(anomalies, to)");
    expect(recordSettlement).toContain("await signClaim(payeeIdentity.claimSkJwk, payeeIdentity.alg, `${group.tagHex}:confirm:${sid}`)");
    expect(recordSettlement).toContain('await commitReserved(2, (f) => [');
    expect(recordSettlement).toContain('makeEvent(f, "SettlementRecorded", { sid, from, to, minor })');
    expect(recordSettlement).toContain('makeEvent(f, "SettlementConfirmed", { sid, pid: to, claimSig })');
    // The non-payee (no local identity, or contested) path still records
    // WITHOUT ever fabricating a confirmation.
    expect(recordSettlement).toContain('await commitReserved(1, (f) => [makeEvent(f, "SettlementRecorded", { sid, from, to, minor })]);');
  });
});
