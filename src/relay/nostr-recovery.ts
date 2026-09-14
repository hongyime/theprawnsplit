import type { NostrCheckpoint } from "./recovery-db";
import type { RelayEntry, RelayRequestOptions } from "./types";

export const NOSTR_RECOVERY_LIMIT = 50;
const FULL_SWEEP_SECONDS = 86_400;
export interface NostrRecoverySource {
  relayUrls: string[];
  recoveryPage(url: string, tag: string, filter: { since: number; until: number; limit: number }, request?: RelayRequestOptions): Promise<RelayEntry[]>;
}

/** NIP-01 limits select newest entries. Walk backwards with an inclusive boundary
 * so a split second is re-read rather than skipped. Basic NIP-01 has no offset
 * for >limit events at one second: stop and disclose that limitation. */
export async function recoverNostrPage(source: NostrRecoverySource, url: string, tag: string,
  previous: NostrCheckpoint | undefined, request?: RelayRequestOptions, now = Math.floor(Date.now() / 1000)) {
  const state = previous ?? { since: 0 };
  const fullSweep = state.until === undefined && (!state.lastSweep || now - state.lastSweep >= FULL_SWEEP_SECONDS);
  const since = fullSweep ? 0 : state.since;
  const until = state.until ?? now;
  const ceiling = state.ceiling ?? now;
  const entries = await source.recoveryPage(url, tag, { since, until, limit: NOSTR_RECOVERY_LIMIT }, request);
  if (entries.length > NOSTR_RECOVERY_LIMIT || entries.some((entry) => !/^\d+$/.test(entry.cursor) ||
      !Number.isSafeInteger(Number(entry.cursor)) || Number(entry.cursor) < since || Number(entry.cursor) > until)) {
    throw new Error("Invalid Nostr recovery page; checkpoint retained");
  }
  const bytes = entries.reduce((sum, entry) => sum + new TextEncoder().encode(entry.blob).byteLength, 0);
  if (bytes > 2_000_000) throw new Error("Nostr recovery page exceeds local transfer limit");
  const oldest = Math.min(...entries.map((entry) => Number(entry.cursor)));
  const exhausted = entries.length < NOSTR_RECOVERY_LIMIT;
  const saturated = !exhausted && oldest === until;
  const sweep = since === 0 && exhausted ? now : state.lastSweep;
  const sweepField = sweep === undefined ? {} : { lastSweep: sweep };
  const next: NostrCheckpoint = exhausted
    ? { since: Math.max(0, ceiling - 1), ...sweepField }
    : { since, until: oldest, ceiling, ...sweepField, saturated };
  // "Exhausted" means this relay's response, not proof of global completeness.
  return { entries, next, exhausted, saturated };
}
