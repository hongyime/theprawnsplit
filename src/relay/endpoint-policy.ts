import type { RelayDiagnostic } from "./types";
import { relayBackoffMs } from "./diagnostics";

// REL-002: diagnostic actions (classifyRelayIssue) previously never influenced
// subsequent adapter scheduling -- a failed or blocked endpoint kept consuming
// attempts at the ordinary cadence forever. This module tracks bounded,
// PER-ENDPOINT (not per-adapter) policy: an operated relay's single endpoint,
// or one specific Nostr relay URL among many, each keyed independently so one
// bad Nostr endpoint never suppresses the others sharing the same adapter.
export interface EndpointPolicy {
  consecutiveFailures: number;
  /** ms epoch; skip this endpoint while now < backoffUntil. */
  backoffUntil?: number;
  /** Explicit permanent demotion (auth-required/blocked/invalid/pow/error).
   * Only cleared by an explicit resetEndpointPolicy() call -- never silently
   * resurrected by the mere passage of time or a later diagnostic. */
  dropped?: boolean;
}

export type EndpointPolicyMap = Record<string, EndpointPolicy>;

export function isEndpointAvailable(policy: EndpointPolicy | undefined, now: number): boolean {
  if (!policy) return true;
  if (policy.dropped) return false;
  if (policy.backoffUntil !== undefined && now < policy.backoffUntil) return false;
  return true;
}

/** Call after a successful attempt against this endpoint -- clears any
 * accumulated backoff. Does NOT clear an explicit `dropped` demotion; only
 * resetEndpointPolicy() does that, since a drop is a policy decision the
 * relay itself cannot un-make just by momentarily seeming to work again. */
export function markEndpointSuccess(current: EndpointPolicy | undefined): EndpointPolicy {
  if (current?.dropped) return current;
  return { consecutiveFailures: 0 };
}

export function applyDiagnosticToPolicy(
  current: EndpointPolicy | undefined,
  diagnostic: RelayDiagnostic,
  now: number,
): EndpointPolicy {
  const base = current ?? { consecutiveFailures: 0 };
  if (diagnostic.actionKind === "treat-as-success") return { consecutiveFailures: 0 };
  if (diagnostic.actionKind === "drop-relay") {
    return { consecutiveFailures: base.consecutiveFailures + 1, dropped: true };
  }
  if (diagnostic.actionKind === "backoff-relay" || diagnostic.actionKind === "retry-relay") {
    const failures = base.consecutiveFailures + 1;
    return {
      consecutiveFailures: failures,
      backoffUntil: now + (diagnostic.retryAfterMs ?? relayBackoffMs(failures)),
      ...(base.dropped ? { dropped: true as const } : {}),
    };
  }
  return base;
}

// A reset is explicit -- never silently resurrected by a later retry looking
// successful, and never triggered merely by the passage of time. Only an
// intentional user/operator action calls this to clear a demoted/dropped
// endpoint back to a clean slate; it never deletes the endpoint from the
// user-configured list, it only clears the accumulated failure policy for it.
export function resetEndpointPolicy(): EndpointPolicy {
  return { consecutiveFailures: 0 };
}
