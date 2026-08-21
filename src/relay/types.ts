export interface RelayEntry {
  blob: string;
  author: string;
  cursor: string;
}

export interface AckResult {
  ok: boolean;
  cursor?: string;
  reason?: string;
}

export type RelayIssueCode = "duplicate" | "rate-limited" | "auth-required" | "blocked" | "invalid" | "pow" | "error" | "timeout" | "unknown";

export interface RelayDiagnostic {
  relay: string;
  operation: "publish" | "fetch" | "snapshot";
  code: RelayIssueCode;
  severity: "info" | "warn" | "error";
  reason: string;
  action: string;
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
