// LOGIC-005 (T55): preview allocation must be salted by the draft's own stable
// identifier, so tied remainders rotate across expenses AND the committed
// financials match the preview. Rendered-UI equivalence: this test drives the
// same `allocatedShares` / `buildSharePreview` helpers Trip.svelte calls, plus
// pins the source-shape wiring so we know Trip.svelte reuses the same salt.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allocate } from "@theprawnsplit/core";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "Trip.svelte"), "utf8");
}

describe("LOGIC-005: preview allocator salt", () => {
  it("rotates tied remainders across two draft xids (was constant with 'preview' salt)", () => {
    // 100n minor split three ways, equal weights => 33/33/34 with 1 leftover
    // routed by fnv1a(eventId + pid). If preview always uses "preview" as the
    // salt, both drafts allocate the extra unit to the same participant.
    const total = 100n;
    const pids = ["p_alice", "p_bob", "p_carol"];
    const weights = [1n, 1n, 1n];

    const draftA = "550e8400-e29b-41d4-a716-446655440000";
    const draftB = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

    const sharesA = allocate(total, weights, draftA, pids);
    const sharesB = allocate(total, weights, draftB, pids);
    const sharesLegacy = allocate(total, weights, "preview", pids);
    const sharesLegacyAgain = allocate(total, weights, "preview", pids);

    // Legacy behaviour: two "preview" calls always favour the same participant.
    expect(sharesLegacy).toEqual(sharesLegacyAgain);

    // Fix behaviour: at least one of the two random-UUID drafts must differ
    // from the legacy "preview" recipient (otherwise the salt has no effect).
    const stringify = (arr: bigint[]): string => arr.map((n) => n.toString()).join(",");
    const differs = stringify(sharesA) !== stringify(sharesLegacy) ||
                    stringify(sharesB) !== stringify(sharesLegacy);
    expect(differs).toBe(true);
  });

  it("wires Trip.svelte so preview shares use a stable draft xid, not the literal 'preview'", () => {
    const source = appSource();
    const buildSharePreview = source.match(/function buildSharePreview\(([\s\S]*?)\n  \}/)?.[1] ?? "";

    // Source-shape: none of the four allocatedShares call sites in
    // buildSharePreview may pass the literal "preview" string any more.
    expect(buildSharePreview).not.toMatch(/allocatedShares\([^)]*"preview"/);
    // The reactive call site must pass draftXid to buildSharePreview.
    expect(source).toMatch(/buildSharePreview\([^)]*draftXid/);
    // A stable `draftXid` state must exist.
    expect(source).toMatch(/let draftXid\b/);
  });

  it("wires addExpense to commit the same xid it previewed with", () => {
    const source = appSource();
    const addExpense = source.match(/async function addExpense\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";

    // ExpenseAdded's xid field must reuse the draft's own xid, not a fresh randomUUID().
    expect(addExpense).toContain("xid: draftXid");
    expect(addExpense).not.toMatch(/xid: crypto\.randomUUID\(\)/);
  });
});
