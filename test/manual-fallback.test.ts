import { describe, expect, it } from "vitest";
import { isManualFallbackDue, MANUAL_FALLBACK_AFTER_MS } from "@/lib/manual-fallback";

describe("manual fallback timing", () => {
  it("promotes manual sharing only after the relay quorum grace window", () => {
    const now = Date.UTC(2026, 7, 21, 12);

    expect(isManualFallbackDue(undefined, now)).toBe(false);
    expect(isManualFallbackDue(now - MANUAL_FALLBACK_AFTER_MS, now)).toBe(false);
    expect(isManualFallbackDue(now - MANUAL_FALLBACK_AFTER_MS - 1, now)).toBe(true);
  });
});
