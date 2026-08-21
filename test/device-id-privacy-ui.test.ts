import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

describe("device ID privacy UI boundary", () => {
  it("does not display local device UUIDs or their prefixes to users", () => {
    const source = appSource();
    const shortDevice = source.match(/function shortDevice\(deviceId\?: string\): string \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const unverifiedReclaim = source.match(/\{:else if anomaly\.code === "unverified-reclaim" && anomaly\.pid\}([\s\S]*?)\{:else\}/)?.[1] ?? "";

    expect(shortDevice).toContain('if (deviceId === group?.deviceId) return "this device";');
    expect(shortDevice).toContain('return "another device";');
    expect(shortDevice).not.toMatch(/slice|substring|substr|deviceId\}/);
    expect(unverifiedReclaim).toContain("shortDevice(participantClaimEvent(anomaly.eventId)?.deviceId)");
    expect(unverifiedReclaim).not.toContain("?.deviceId ??");
    expect(source).not.toMatch(/deviceId\.slice|deviceId\.substring|deviceId\.substr/);
  });
});
