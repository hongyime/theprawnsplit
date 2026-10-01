import { describe, expect, it } from "vitest";
import {
  applyDiagnosticToPolicy,
  isEndpointAvailable,
  markEndpointSuccess,
  resetEndpointPolicy,
  type EndpointPolicy,
} from "@/relay/endpoint-policy";
import type { RelayDiagnostic } from "@/relay/types";

function diagnostic(actionKind: RelayDiagnostic["actionKind"], retryAfterMs?: number): RelayDiagnostic {
  return {
    relay: "fixture",
    operation: "publish",
    code: "unknown",
    severity: "warn",
    reason: "fixture reason",
    actionKind,
    action: "fixture action",
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}

describe("REL-002 endpoint policy (per-endpoint backoff/demotion accounting)", () => {
  it("treats an endpoint with no recorded policy as available", () => {
    expect(isEndpointAvailable(undefined, Date.now())).toBe(true);
  });

  it("skips an endpoint whose backoff has not yet elapsed", () => {
    const policy: EndpointPolicy = { consecutiveFailures: 1, backoffUntil: 1_000 };
    expect(isEndpointAvailable(policy, 500)).toBe(false);
    expect(isEndpointAvailable(policy, 1_000)).toBe(true);
    expect(isEndpointAvailable(policy, 1_500)).toBe(true);
  });

  it("skips a dropped endpoint regardless of elapsed time", () => {
    const policy: EndpointPolicy = { consecutiveFailures: 5, dropped: true };
    expect(isEndpointAvailable(policy, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("applies a backoff-relay diagnostic by scheduling retryAfterMs from now and incrementing failures", () => {
    const updated = applyDiagnosticToPolicy(undefined, diagnostic("backoff-relay", 5_000), 1_000);
    expect(updated).toEqual({ consecutiveFailures: 1, backoffUntil: 6_000 });
  });

  it("applies a drop-relay diagnostic as a permanent demotion, not a mere timed backoff", () => {
    const updated = applyDiagnosticToPolicy(undefined, diagnostic("drop-relay"), 1_000);
    expect(updated).toEqual({ consecutiveFailures: 1, dropped: true });
    // Permanently dropped -- unavailable even far in the future, unlike backoff.
    expect(isEndpointAvailable(updated, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("accumulates consecutive failures across repeated diagnostics instead of resetting each time", () => {
    let policy: EndpointPolicy | undefined;
    policy = applyDiagnosticToPolicy(policy, diagnostic("retry-relay"), 0);
    policy = applyDiagnosticToPolicy(policy, diagnostic("retry-relay"), 100);
    policy = applyDiagnosticToPolicy(policy, diagnostic("retry-relay"), 200);
    expect(policy.consecutiveFailures).toBe(3);
  });

  it("a treat-as-success diagnostic clears the policy back to a clean slate", () => {
    const dropped: EndpointPolicy = { consecutiveFailures: 3, dropped: true };
    expect(applyDiagnosticToPolicy(dropped, diagnostic("treat-as-success"), 0)).toEqual({ consecutiveFailures: 0 });
  });

  it("markEndpointSuccess clears backoff/failure count but never un-drops an explicitly dropped endpoint", () => {
    expect(markEndpointSuccess(undefined)).toEqual({ consecutiveFailures: 0 });
    expect(markEndpointSuccess({ consecutiveFailures: 4, backoffUntil: 9_999 })).toEqual({ consecutiveFailures: 0 });
    const dropped: EndpointPolicy = { consecutiveFailures: 5, dropped: true };
    // A success signal alone (e.g. a stale in-flight retry that happened to
    // land after the drop decision) must never silently resurrect a drop --
    // REL-002 requires an EXPLICIT reset for that.
    expect(markEndpointSuccess(dropped)).toBe(dropped);
  });

  it("resetEndpointPolicy explicitly clears a dropped/backed-off endpoint back to a clean slate", () => {
    expect(resetEndpointPolicy()).toEqual({ consecutiveFailures: 0 });
    const reset = resetEndpointPolicy();
    expect(isEndpointAvailable(reset, 0)).toBe(true);
  });
});
