import type { RelayDiagnostic } from "@/relay/types";

function formatDelay(ms: number): string {
  if (ms < 60_000) return `${Math.ceil(ms / 1_000)}s`;
  return `${Math.ceil(ms / 60_000)}m`;
}

export function relayDiagnosticActionText(diagnostic: Pick<RelayDiagnostic, "action" | "actionKind" | "retryAfterMs">): string {
  if (diagnostic.actionKind === "backoff-relay" && diagnostic.retryAfterMs !== undefined) {
    return `${diagnostic.action}; retry in ${formatDelay(diagnostic.retryAfterMs)}`;
  }
  return diagnostic.action;
}
