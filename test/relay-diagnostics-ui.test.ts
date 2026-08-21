import { describe, expect, it } from "vitest";
import { relayDiagnosticActionText } from "@/lib/relay-diagnostics";

describe("relay diagnostics display", () => {
  it("surfaces retry windows for backoff diagnostics", () => {
    expect(
      relayDiagnosticActionText({
        actionKind: "backoff-relay",
        action: "back off this relay and continue with other relays",
        retryAfterMs: 40_000,
      }),
    ).toBe("back off this relay and continue with other relays; retry in 40s");

    expect(
      relayDiagnosticActionText({
        actionKind: "backoff-relay",
        action: "back off this relay and continue with other relays",
        retryAfterMs: 120_000,
      }),
    ).toBe("back off this relay and continue with other relays; retry in 2m");
  });

  it("leaves non-backoff diagnostics unchanged", () => {
    expect(
      relayDiagnosticActionText({
        actionKind: "drop-relay",
        action: "drop relay and surface diagnostic",
      }),
    ).toBe("drop relay and surface diagnostic");
  });
});
