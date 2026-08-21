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

export function classifyRelayIssue(input: { relay: string; operation: RelayDiagnostic["operation"]; reason: string }): RelayDiagnostic {
  const code = input.reason === "timeout" ? "timeout" : relayIssueCode(input.reason);
  if (code === "duplicate") {
    return { ...input, code, severity: "info", action: "already stored; treat as publish success" };
  }
  if (code === "rate-limited" || code === "timeout") {
    return { ...input, code, severity: "warn", action: "retry later" };
  }
  if (code === "auth-required" || code === "blocked") {
    return { ...input, code, severity: "warn", action: "drop relay for this sync and use fallback relays" };
  }
  if (code === "invalid" || code === "pow" || code === "error") {
    return { ...input, code, severity: "error", action: "drop relay and surface diagnostic" };
  }
  return { ...input, code, severity: "warn", action: "count as relay failure and retry" };
}
