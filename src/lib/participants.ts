import type { ParticipantState } from "@theprawnsplit/core";

export type ParticipantNameMatchKind = "exact" | "prefix" | "levenshtein";

export interface ParticipantNameMatch {
  pid: string;
  name: string;
  kind: ParticipantNameMatchKind;
}

export interface ParticipantClaimGroups<T extends Pick<ParticipantState, "devices">> {
  unclaimed: T[];
  claimed: T[];
}

export function normalizeParticipantName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, "");
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}

export function findParticipantNameMatch(input: string, participants: Pick<ParticipantState, "pid" | "name">[]): ParticipantNameMatch | undefined {
  const candidate = normalizeParticipantName(input);
  if (!candidate) return undefined;

  for (const participant of participants) {
    const existing = normalizeParticipantName(participant.name);
    if (!existing) continue;
    if (candidate === existing) return { pid: participant.pid, name: participant.name, kind: "exact" };
    if (candidate.startsWith(existing) || existing.startsWith(candidate)) return { pid: participant.pid, name: participant.name, kind: "prefix" };
    if (levenshteinDistance(candidate, existing) <= 2) return { pid: participant.pid, name: participant.name, kind: "levenshtein" };
  }

  return undefined;
}

export function groupParticipantsForClaim<T extends Pick<ParticipantState, "devices">>(participants: T[]): ParticipantClaimGroups<T> {
  return participants.reduce<ParticipantClaimGroups<T>>(
    (groups, participant) => {
      if (participant.devices.length === 0) groups.unclaimed.push(participant);
      else groups.claimed.push(participant);
      return groups;
    },
    { unclaimed: [], claimed: [] },
  );
}

export function defaultSplitSelection<T extends Pick<ParticipantState, "pid" | "deactivated">>(
  participants: T[],
  current: Record<string, boolean>,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const participant of participants) {
    if (participant.deactivated) next[participant.pid] = false;
    else next[participant.pid] = current[participant.pid] ?? true;
  }
  return next;
}
