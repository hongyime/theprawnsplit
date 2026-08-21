import type { RelayDiagnostic, RelayIssueCode } from "./types";

const PREFIX_CODES: RelayIssueCode[] = ["duplicate", "rate-limited", "auth-required", "blocked", "invalid", "pow", "error"];

export function relayIssueCode(reason: string): RelayIssueCode {
  const normalized = reason.trim().toLocaleLowerCase();
  const prefix = normalized.split(":", 1)[0] ?? "";
  return PREFIX_CODES.includes(prefix as RelayIssueCode) ? (prefix as RelayIssueCode) : "unknown";
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
  return { ...input, code, severity: "warn", actionKind: "retry-relay", action: "count as relay failure and retry" };
}
