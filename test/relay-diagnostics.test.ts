import { describe, expect, it } from "vitest";
import { classifyRelayIssue, isDuplicateRelayAck, relayBackoffMs, relayIssueCode } from "@/relay/diagnostics";

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

  it("acts on duplicate as publish success", () => {
    const diagnostic = classifyRelayIssue({ relay: "nostr", operation: "publish", reason: "duplicate: already saved" });
    expect(isDuplicateRelayAck(diagnostic.reason)).toBe(true);
    expect(diagnostic).toMatchObject({ code: "duplicate", severity: "info", actionKind: "treat-as-success" });
    expect(diagnostic.action).toContain("publish success");
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

  it("computes bounded exponential backoff for retryable relay failures", () => {
    expect([0, 1, 2, 5, 9].map(relayBackoffMs)).toEqual([10_000, 20_000, 40_000, 320_000, 320_000]);
  });
});
