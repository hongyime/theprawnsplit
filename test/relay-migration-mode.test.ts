import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRelay } from "@/relay/http";
import { discoverMigration } from "@/relay/migration-mode";
import { RecoveryRepository } from "@/relay/recovery-db";
import handler from "../api/relay";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("explicit migration authority and stale HTTP clients", () => {
  it("initializes concurrent discovery transactionally without replacing a pending packet", async () => {
    const name = `discovery-race-${crypto.randomUUID()}`;
    const first = new RecoveryRepository(name), second = new RecoveryRepository(name);
    try {
      const states = await Promise.all([first.initialize("scope"), second.initialize("scope")]);
      expect(states[0]).toEqual(states[1]);
      const pending = { blob: "encrypted-pending", author: "fixture", events: [] };
      await first.save({ ...states[0]!, pending });
      expect((await second.initialize("scope")).pending).toEqual(pending);
    } finally { await first.close(); await second.close(); }
  });
  it("blocks both modern and old HTTP writes during the barrier without touching the provider", async () => {
    vi.stubEnv("PRAWNSPLIT_RELAY_MIGRATION", "paused");
    vi.stubEnv("PRAWNSPLIT_RELAY_BACKEND", "supabase");
    vi.stubEnv("PRAWNSPLIT_SUPABASE_URL", "https://synthetic.supabase.co");
    vi.stubEnv("PRAWNSPLIT_SUPABASE_SECRET_KEY", "sb_secret_synthetic_fixture");
    const provider = vi.fn(); vi.stubGlobal("fetch", provider);
    const response = await handler(new Request("https://fixture.invalid/api/relay", { method: "POST", body: JSON.stringify({
      tag: "a".repeat(64), blob: "encrypted", author: "old-device", writeProof: "b".repeat(64),
    }) }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "relay migration temporarily pauses writes; retry later" });
    expect(provider).not.toHaveBeenCalled();
    const capability = await handler(new Request("https://fixture.invalid/api/relay?capabilities=1"));
    expect(await capability.json()).toMatchObject({ mode: "paused", generation: null });
    expect(capability.headers.get("cache-control")).toBe("no-store");
  });

  it("cannot advertise the completed generation while the backend remains Upstash", async () => {
    vi.stubEnv("PRAWNSPLIT_RELAY_MIGRATION", "supabase-v1");
    vi.stubEnv("PRAWNSPLIT_RELAY_BACKEND", "upstash");
    expect((await handler(new Request("https://fixture.invalid/api/relay?capabilities=1"))).status).toBe(503);
  });

  it("rejects a legacy phase pointing at Supabase before capability reads or writes reach the provider", async () => {
    vi.stubEnv("PRAWNSPLIT_RELAY_MIGRATION", "legacy");
    vi.stubEnv("PRAWNSPLIT_RELAY_BACKEND", "supabase");
    const provider = vi.fn(); vi.stubGlobal("fetch", provider);
    expect((await handler(new Request("https://fixture.invalid/api/relay?capabilities=1"))).status).toBe(503);
    expect((await handler(new Request("https://fixture.invalid/api/relay", { method: "POST", body: "{}" }))).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });

  it("keeps its accepted generation through reloads and refuses silent legacy fallback", async () => {
    vi.stubGlobal("window", { location: { origin: "https://fixture.invalid" } });
    let mode = "supabase-v1";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ protocol: 1, mode, generation: mode === "supabase-v1" ? mode : null }))));
    const name = `migration-generation-${crypto.randomUUID()}`;
    const first = new RecoveryRepository(name);
    const accepted = await discoverMigration("group", new HttpRelay(), {}, first);
    expect(accepted.state?.generation).toBe("supabase-v1");
    await first.close();
    const reopened = new RecoveryRepository(name);
    mode = "legacy";
    await expect(discoverMigration("group", new HttpRelay(), {}, reopened)).rejects.toThrow("local changes are safe");
    mode = "paused";
    expect((await discoverMigration("group", new HttpRelay(), {}, reopened)).state?.generation).toBe("supabase-v1");
    await reopened.close();
  });
});
