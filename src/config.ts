export const config = {
  nostrKind: Number(import.meta.env.VITE_NOSTR_KIND ?? 1512),
  nostrRelays: String(
    import.meta.env.VITE_NOSTR_RELAYS ??
      "wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net,wss://nostr.mom,wss://offchain.pub",
  )
    .split(",")
    .map((relay) => relay.trim())
    .filter(Boolean),
  relayEndpoint: String(import.meta.env.VITE_RELAY_ENDPOINT ?? "/api/relay"),
  schemaVersion: Number(import.meta.env.VITE_SCHEMA_VERSION ?? 2),
  pollActiveMs: Number(import.meta.env.VITE_POLL_ACTIVE_MS ?? 10_000),
  pollBackoffMs: Number(import.meta.env.VITE_POLL_BACKOFF_MS ?? 60_000),
  pollIdleMs: Number(import.meta.env.VITE_POLL_IDLE_MS ?? 120_000),
  idleAfterMs: Number(import.meta.env.VITE_IDLE_AFTER_MS ?? 120_000),
  ackQuorum: Number(import.meta.env.VITE_ACK_QUORUM ?? 2),
  batchMaxEvents: Number(import.meta.env.VITE_BATCH_MAX_EVENTS ?? 50),
  capUnknownAuthor: Number(import.meta.env.VITE_CAP_UNKNOWN_AUTHOR ?? 50),
  capKnownAuthor: Number(import.meta.env.VITE_CAP_KNOWN_AUTHOR ?? 1000),
  driftBufferMax: Number(import.meta.env.VITE_DRIFT_BUFFER_MAX ?? 500),
  maxFutureDriftMs: Number(import.meta.env.VITE_MAX_FUTURE_DRIFT_MS ?? 120_000),
  snapshotEvery: Number(import.meta.env.VITE_SNAPSHOT_EVERY ?? 100),
};
