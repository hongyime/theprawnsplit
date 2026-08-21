export function parseClientNumericConfig(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export const config = {
  nostrKind: parseClientNumericConfig(import.meta.env.VITE_NOSTR_KIND, 1512),
  nostrRelays: String(
    import.meta.env.VITE_NOSTR_RELAYS ??
      "wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net,wss://nostr.mom,wss://offchain.pub",
  )
    .split(",")
    .map((relay) => relay.trim())
    .filter(Boolean),
  relayEndpoint: String(import.meta.env.VITE_RELAY_ENDPOINT ?? "/api/relay"),
  schemaVersion: parseClientNumericConfig(import.meta.env.VITE_SCHEMA_VERSION, 2),
  pollActiveMs: parseClientNumericConfig(import.meta.env.VITE_POLL_ACTIVE_MS, 10_000),
  pollBackoffMs: parseClientNumericConfig(import.meta.env.VITE_POLL_BACKOFF_MS, 60_000),
  pollIdleMs: parseClientNumericConfig(import.meta.env.VITE_POLL_IDLE_MS, 120_000),
  idleAfterMs: parseClientNumericConfig(import.meta.env.VITE_IDLE_AFTER_MS, 120_000),
  ackQuorum: parseClientNumericConfig(import.meta.env.VITE_ACK_QUORUM, 2),
  batchMaxEvents: parseClientNumericConfig(import.meta.env.VITE_BATCH_MAX_EVENTS, 50),
  capUnknownAuthor: parseClientNumericConfig(import.meta.env.VITE_CAP_UNKNOWN_AUTHOR, 50),
  capKnownAuthor: parseClientNumericConfig(import.meta.env.VITE_CAP_KNOWN_AUTHOR, 1000),
  capGroupTotal: parseClientNumericConfig(import.meta.env.VITE_CAP_GROUP_TOTAL, 10_000),
  driftBufferMax: parseClientNumericConfig(import.meta.env.VITE_DRIFT_BUFFER_MAX, 500),
  maxFutureDriftMs: parseClientNumericConfig(import.meta.env.VITE_MAX_FUTURE_DRIFT_MS, 120_000),
  snapshotEvery: parseClientNumericConfig(import.meta.env.VITE_SNAPSHOT_EVERY, 100),
};
