export interface RelayEntry {
  blob: string;
  author: string;
  /**
   * Cursor is relay-kind-specific and MUST NOT be compared across kinds (CR-012):
   * - HttpRelay (operated relay): opaque server-side token, interpreted only by the server.
   * - NostrRelay: created_at watermark — a decimal-seconds string fed back as the NIP-01
   *   `since` filter. Event ids are sha256 digests and MUST NOT be used as cursors here:
   *   ordering them is random, so an id cursor silently discarded an arbitrary fraction of
   *   every fetch after the first. The boundary second may re-deliver events; ingestion
   *   dedupes by event id (REQ-SYN-09).
   */
  cursor: string;
}

export interface AckResult {
  ok: boolean;
  cursor?: string;
  reason?: string;
}

export type RelayIssueCode = "duplicate" | "rate-limited" | "auth-required" | "blocked" | "invalid" | "pow" | "error" | "timeout" | "unknown";
export type RelayActionKind = "treat-as-success" | "backoff-relay" | "drop-relay" | "retry-relay";

export interface RelayDiagnostic {
  relay: string;
  operation: "publish" | "fetch" | "snapshot";
  code: RelayIssueCode;
  severity: "info" | "warn" | "error";
  reason: string;
  actionKind: RelayActionKind;
  action: string;
  retryAfterMs?: number;
}

export interface Relay {
  name: string;
  publish(tag: string, author: string, blob: string, writeProof: string): Promise<AckResult>;
  fetch(tag: string, opts: { author?: string; cursor?: string | null; limit?: number }): Promise<RelayEntry[]>;
}

export interface SyncResult {
  published: number;
  confirmed: number;
  received: number;
  buffered: number;
  dropped: number;
  snapshotsPublished: number;
  snapshotsSeen: number;
  errors: string[];
  diagnostics: RelayDiagnostic[];
}
