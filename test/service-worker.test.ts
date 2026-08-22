import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("service worker cache boundary", () => {
  it("keeps relay API and dynamic responses out of the offline cache", () => {
    const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

    expect(source).toContain('const CACHE_NAME = "theprawnsplit-v3";');
    expect(source).toContain('if (url.pathname.startsWith("/api/")) return false;');
    expect(source).toContain("APP_SHELL.includes(url.pathname)");
    expect(source).toContain("CACHEABLE_PREFIXES");
    expect(source).toContain("if (!isCacheable(event.request)) return;");
    expect(source).not.toMatch(/event\.request\.method !== "GET"\) return;[\s\S]*?cache\.put\(event\.request/m);
  });

  it("does not depend on background sync or push notification events", () => {
    const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

    expect(source).not.toMatch(/\b(?:SyncManager|PeriodicSyncManager|PushManager|Notification)\b/);
    expect(source).not.toMatch(/\b(?:sync|periodicsync|push|notificationclick)\b/);
    expect(source).not.toMatch(/\.(?:sync|periodicSync|pushManager)\.(?:register|subscribe)\b/);
  });
});
