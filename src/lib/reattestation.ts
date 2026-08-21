import type { Event, ParticipantState } from "@theprawnsplit/core";

export interface ReattestationStatus {
  claimedPeerCount: number;
  threshold: number;
  attestedCount: number;
  caveat: string | undefined;
}

export function reattestationThreshold(claimedPeerCount: number): number {
  return Math.max(1, Math.floor((claimedPeerCount - 1) / 2) + 1);
}

export function reattestationStatus(input: {
  events: Event[];
  participants: Pick<ParticipantState, "pid" | "devices">[];
  targetPid: string;
  newDevice?: string;
  newClaimPk?: string;
}): ReattestationStatus {
  const claimedPeers = new Set(
    input.participants
      .filter((participant) => participant.pid !== input.targetPid && participant.devices.length > 0)
      .map((participant) => participant.pid),
  );
  const claimedPeerCount = claimedPeers.size;
  const threshold = reattestationThreshold(claimedPeerCount);
  const attestors = new Set<string>();

  for (const event of input.events) {
    if (event.t !== "ClaimReattested" || event.pid !== input.targetPid) continue;
    if (input.newDevice && event.newDevice !== input.newDevice) continue;
    if (input.newClaimPk && event.newClaimPk !== input.newClaimPk) continue;
    if (!claimedPeers.has(event.attestor)) continue;
    attestors.add(event.attestor);
  }

  return {
    claimedPeerCount,
    threshold,
    attestedCount: attestors.size,
    caveat: claimedPeerCount <= 1 ? "No independent peer is available; restore an identity backup or void the claim." : claimedPeerCount === 2 ? "Small group caveat: one peer can restore authority, so verify this socially." : undefined,
  };
}
