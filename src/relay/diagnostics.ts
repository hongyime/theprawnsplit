import type { RelayDiagnostic, RelayIssueCode } from "./types";

const PREFIX_CODES: RelayIssueCode[] = ["duplicate", "rate-limited", "auth-required", "blocked", "invalid", "pow", "error"];

// Non-standard rejection reasons that indicate a structural policy barrier.
// These cannot be retried successfully; the relay must be demoted for this session.
// §9.6: NIP-01 defines standard prefixes, but relays may use free-form human text.
const WOT_BLOCK_PATTERN = /web of trust|not trusted|policy|whitelist|not allowed|restricted/i;

// Per-session unknown-rejection counters: relay url → count.
const unknownRejectionCounts = new Map<string, number>();
const UNKNOWN_REJECTION_ESCALATION_THRESHOLD = 3;

export function relayIssueCode(reason: string): RelayIssueCode {
  const normalized = reason.trim().toLocaleLowerCase();
  const prefix = normalized.split(":", 1)[0] ?? "";
  if (PREFIX_CODES.includes(prefix as RelayIssueCode)) return prefix as RelayIssueCode;

  // Non-standard text: match on meaning for web-of-trust / policy rejections.
  if (WOT_BLOCK_PATTERN.test(reason)) return "blocked";

  return "unknown";
}

export function isDuplicateRelayAck(reason?: string): boolean {
  return reason ? relayIssueCode(reason) === "duplicate" : false;
}

export function relayBackoffMs(attempt: number): number {
  const boundedAttempt = Math.max(0, Math.min(5, Math.floor(attempt)));
  return 10_000 * 2 ** boundedAttempt;
}

export function classifyRelayIssue(input: { relay: string; operation: RelayDiagnostic["operation"]; reason: string }): RelayDiagnostic {
  const code = input.reason === "timeout" ? "timeout" : relayIssueCode(input.reason);
  if (code === "duplicate") {
    return { ...input, code, severity: "info", actionKind: "treat-as-success", action: "already stored; treat as publish success" };
  }
  if (code === "rate-limited" || code === "timeout") {
    return { ...input, code, severity: "warn", actionKind: "backoff-relay", action: "back off this relay and continue with other relays", retryAfterMs: relayBackoffMs(0) };
  }
  if (code === "auth-required" || code === "blocked") {
    return { ...input, code, severity: "warn", actionKind: "drop-relay", action: "drop relay and use fallback relays" };
  }
  if (code === "invalid" || code === "pow" || code === "error") {
    return { ...input, code, severity: "error", actionKind: "drop-relay", action: "drop relay and surface diagnostic" };
  }

  // Unknown reason: count per relay. After threshold, escalate to drop-relay.
  const count = (unknownRejectionCounts.get(input.relay) ?? 0) + 1;
  unknownRejectionCounts.set(input.relay, count);
  if (count >= UNKNOWN_REJECTION_ESCALATION_THRESHOLD) {
    return { ...input, code, severity: "warn", actionKind: "drop-relay", action: `unknown rejection repeated ${count}x — drop relay and surface diagnostic` };
  }
  return { ...input, code, severity: "warn", actionKind: "retry-relay", action: "count as relay failure and retry" };
}

/** Reset per-session unknown rejection counts. Call between sync sessions. */
export function resetUnknownRejectionCounts(): void {
  unknownRejectionCounts.clear();
}
