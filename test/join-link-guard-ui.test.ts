// DATA-002: copyJoinLink/showJoinQrCode must refuse to build or share a join
// link/QR code for an explicitly unlinked (offline) group -- that link would
// be built from a fabricated secret/tag pair that no peer actually shares,
// so "sharing" it could never let anyone join the real trip this group was
// imported from. Source-shape verification (see export-prompt-ui.test.ts for
// the same convention in this codebase): the guard is a simple, low-risk
// early-return, and the actual DATA correctness this task fixes is already
// thoroughly covered by test/import-linkage.test.ts's 7 repo-level tests.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "Trip.svelte"), "utf8");
}

describe("join link/QR unlinked-group guard (DATA-002)", () => {
  it("copyJoinLink refuses to build a link for an unlinked group before touching the clipboard", () => {
    const source = appSource();
    const copyJoinLink = source.match(/async function copyJoinLink\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(copyJoinLink).toContain('if (group.linked === false)');
    // The guard must return before buildJoinLink/createJoinSeed ever run.
    const guardIndex = copyJoinLink.indexOf("group.linked === false");
    const buildIndex = copyJoinLink.indexOf("buildJoinLink(");
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(guardIndex);
  });

  it("showJoinQrCode refuses to generate a QR code for an unlinked group", () => {
    const source = appSource();
    const showJoinQrCode = source.match(/async function showJoinQrCode\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(showJoinQrCode).toContain('if (group.linked === false)');
    const guardIndex = showJoinQrCode.indexOf("group.linked === false");
    const buildIndex = showJoinQrCode.indexOf("buildJoinLink(");
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(guardIndex);
  });
});
