import { describe, expect, it } from "vitest";
import { classifyRelayIssue, isDuplicateRelayAck, relayBackoffMs, relayIssueCode, resetUnknownRejectionCounts } from "@/relay/diagnostics";

describe("relay diagnostics", () => {
  it("parses NIP-01 OK prefixes", () => {
    expect(relayIssueCode("duplicate: already have this event")).toBe("duplicate");
    expect(relayIssueCode("rate-limited: slow down")).toBe("rate-limited");
    expect(relayIssueCode("auth-required: sign in")).toBe("auth-required");
    expect(relayIssueCode("blocked: policy")).toBe("blocked");
    expect(relayIssueCode("invalid: bad event")).toBe("invalid");
    expect(relayIssueCode("pow: insufficient work")).toBe("pow");
    expect(relayIssueCode("error: storage unavailable")).toBe("error");
    expect(relayIssueCode("socket closed")).toBe("unknown");
  });

  it("maps verbatim offchain.pub WoT rejection to blocked", () => {
    // Observed live on 2026-08-22 via raw WebSocket probe.
    expect(relayIssueCode("Policy violated and pubkey is not in our web of trust.")).toBe("blocked");
    // Verify variants also match.
    expect(relayIssueCode("not in our web of trust")).toBe("blocked");
    expect(relayIssueCode("pubkey not trusted")).toBe("blocked");
    expect(relayIssueCode("restricted relay")).toBe("blocked");
    // Ensure non-WoT unknowns are still classified correctly.
    expect(relayIssueCode("socket closed")).toBe("unknown");
  });

  it("acts on duplicate as publish success", () => {
    const diagnostic = classifyRelayIssue({ relay: "nostr", operation: "publish", reason: "duplicate: already saved" });
    expect(isDuplicateRelayAck(diagnostic.reason)).toBe(true);
    expect(diagnostic).toMatchObject({ code: "duplicate", severity: "info", actionKind: "treat-as-success" });
    expect(diagnostic.action).toContain("publish success");
  });

  it("classifies WoT rejection as drop-relay without retry", () => {
    const diagnostic = classifyRelayIssue({
      relay: "offchain.pub",
      operation: "publish",
      reason: "Policy violated and pubkey is not in our web of trust.",
    });
    expect(diagnostic).toMatchObject({ code: "blocked", severity: "warn", actionKind: "drop-relay" });
  });

  it("surfaces retryable and relay-drop failures distinctly", () => {
    expect(classifyRelayIssue({ relay: "nostr", operation: "publish", reason: "rate-limited: slow down" })).toMatchObject({
      code: "rate-limited",
      actionKind: "backoff-relay",
      retryAfterMs: 10_000,
    });
    expect(classifyRelayIssue({ relay: "nostr", operation: "publish", reason: "auth-required: sign in" })).toMatchObject({
      code: "auth-required",
      actionKind: "drop-relay",
      severity: "warn",
    });
    expect(classifyRelayIssue({ relay: "nostr", operation: "publish", reason: "invalid: bad event" })).toMatchObject({
      code: "invalid",
      severity: "error",
      actionKind: "drop-relay",
      action: "drop relay and surface diagnostic",
    });
  });

  it("escalates unknown rejection to drop-relay after threshold", () => {
    resetUnknownRejectionCounts();
    const relay = "some-relay";
    // First two: retry-relay
    expect(classifyRelayIssue({ relay, operation: "publish", reason: "some unknown reason" })).toMatchObject({ actionKind: "retry-relay" });
    expect(classifyRelayIssue({ relay, operation: "publish", reason: "some unknown reason" })).toMatchObject({ actionKind: "retry-relay" });
    // Third hit: escalate to drop-relay
    expect(classifyRelayIssue({ relay, operation: "publish", reason: "some unknown reason" })).toMatchObject({ actionKind: "drop-relay" });
    resetUnknownRejectionCounts();
  });

  it("computes bounded exponential backoff for retryable relay failures", () => {
    expect([0, 1, 2, 5, 9].map(relayBackoffMs)).toEqual([10_000, 20_000, 40_000, 320_000, 320_000]);
  });
});
