// CR-011 Task 6 — A13 mitigation helpers.
//
// PRD §12 A13 was measured FALSE on 2026-08-24 (see .agents/task0-retention.md):
// a 50-event ledger batch serialized to 221,449 bytes, over the 131,072-byte
// max_message_length reported by three of the five default Nostr relays.
// These helpers size outbound batches against the smallest known relay limit
// so a batch never exceeds what the weakest relay accepts.

/** Safety margin subtracted from every relay's reported limit. */
export const BATCH_SAFETY_MARGIN_BYTES = 4096;

/**
 * Resolve the message limit from per-relay NIP-11 max_message_length values.
 * Relays with unknown limits are ignored as long as at least one limit is known;
 * if none are known the caller's fallback limit applies.
 */
export function resolveMessageLimit(limits: (number | null)[], fallbackBytes: number): number {
  const known = limits.filter((limit): limit is number => typeof limit === "number" && Number.isFinite(limit) && limit > 0);
  return known.length > 0 ? Math.min(...known) : fallbackBytes;
}

/**
 * Largest batch count whose projected serialized size fits within the limit.
 * `sizeFor` must be monotonic in `n`; it is called O(log n) times.
 */
export function fitCountWithinLimit(
  totalEvents: number,
  sizeFor: (count: number) => number,
  limitBytes: number,
): number {
  if (totalEvents <= 0) return 0;
  if (sizeFor(totalEvents) <= limitBytes) return totalEvents;
  let low = 0;
  let high = totalEvents;
  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    if (mid <= low) break;
    if (sizeFor(mid) <= limitBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

/**
 * Linear size model derived from one real encryption measurement: the cost of a
 * batch is dominated by per-event ciphertext, so projecting from a single probe
 * encryption keeps us honest without encrypting twice per step in the common case.
 */
export function projectBatchSize(probeTotalBytes: number, probeCount: number, count: number): number {
  if (probeCount <= 0) return probeTotalBytes;
  return Math.ceil((probeTotalBytes * count) / probeCount);
}
