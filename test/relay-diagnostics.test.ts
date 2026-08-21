import { describe, expect, it } from "vitest";
import { classifyRelayIssue, isDuplicateRelayAck, relayIssueCode } from "@/relay/diagnostics";

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
    expect(diagnostic).toMatchObject({ code: "duplicate", severity: "info" });
    expect(diagnostic.action).toContain("publish success");
  });

  it("surfaces retryable and relay-drop failures distinctly", () => {
    expect(classifyRelayIssue({ relay: "nostr", operation: "publish", reason: "rate-limited: slow down" })).toMatchObject({
      code: "rate-limited",
      action: "retry later",
    });
    expect(classifyRelayIssue({ relay: "nostr", operation: "publish", reason: "invalid: bad event" })).toMatchObject({
      code: "invalid",
      severity: "error",
      action: "drop relay and surface diagnostic",
    });
  });
});
