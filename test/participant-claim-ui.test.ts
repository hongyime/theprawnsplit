import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

describe("participant claim UI boundary", () => {
  it("keeps join claims focused on existing shadow participants before creating new people", () => {
    const source = appSource();
    const roster = source.match(/<article class="panel roster">([\s\S]*?)<\/article>/)?.[1] ?? "";

    const unclaimedIndex = roster.indexOf("participantClaimGroups.unclaimed");
    const claimedIndex = roster.indexOf("participantClaimGroups.claimed");
    const createIndex = roster.indexOf('class="row create-person"');
    const duplicateIndex = roster.indexOf("participantNameMatch");

    expect(source).toContain("$: participantClaimGroups = groupParticipantsForClaim(participants);");
    expect(unclaimedIndex).toBeGreaterThanOrEqual(0);
    expect(claimedIndex).toBeGreaterThan(unclaimedIndex);
    expect(createIndex).toBeGreaterThan(claimedIndex);
    expect(duplicateIndex).toBeGreaterThan(createIndex);
    expect(roster).toContain('<div class="claim-section primary-claim">');
    expect(roster).toContain("<h3>Unclaimed</h3>");
    expect(roster).toContain('<details class="claim-section claimed-section">');
    expect(roster).toContain("Claimed people ({participantClaimGroups.claimed.length})");
    expect(roster).toContain('on:click={() => requestClaimParticipant(participant.pid)}');
    expect(roster).toContain('placeholder="Add shadow participant"');
    expect(roster).toContain('{matchText(participantNameMatch)} Select the existing person before creating a new one.');
  });

  it("keeps the claim confirmation modal provenance-rich instead of a yes/no prompt", () => {
    const source = appSource();
    const modal = source.match(/{#if claimCandidate}([\s\S]*?){\/if}/)?.[1] ?? "";

    expect(source).toContain("function requestClaimParticipant(pid: string): void");
    expect(source).toContain("claimCandidatePid = pid;");
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-label="Claim participant"');
    expect(modal).toContain("<h2>Claim {claimCandidate.name}</h2>");
    expect(modal).toContain("<dt>Added</dt>");
    expect(modal).toContain("{participantAddAttribution(claimCandidate.pid)}");
    expect(modal).toContain("<dt>Current balance</dt>");
    expect(modal).toContain("{claimBalance(claimCandidate.pid)}");
    expect(modal).toContain("<dt>This device</dt>");
    expect(modal).toContain("{shortDevice(group.deviceId)} will be able to confirm settlements for {claimCandidate.name}.");
    expect(modal).toContain('on:click={() => (claimCandidatePid = "")}>Cancel');
    expect(modal).toContain("on:click={() => claimParticipant(claimCandidate.pid)}");
    expect(modal).not.toMatch(/window\.confirm|confirm\(/);
  });
});
