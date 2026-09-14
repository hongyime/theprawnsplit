import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { writeProofCommitment } from "../api/relay";
import { SupabaseRelayStore } from "../server/supabase-relay";
import { groupKey } from "../src/crypto/group";
import { encryptEnvelope, decryptEnvelope } from "../src/crypto/envelope";
import { HttpRelay } from "../src/relay/http";

const tag = "a".repeat(64), proof = "b".repeat(64);
const sourceUrl = "https://fixture.supabase.co";
const secret = "sb_secret_fixture_server_only";
const names = ["PRAWNSPLIT_RELAY_BACKEND", "PRAWNSPLIT_RELAY_MIGRATION", "PRAWNSPLIT_SUPABASE_URL", "PRAWNSPLIT_SUPABASE_SECRET_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
function configured() {
  process.env.PRAWNSPLIT_RELAY_BACKEND = "supabase";
  process.env.PRAWNSPLIT_RELAY_MIGRATION = "supabase-v1";
  process.env.PRAWNSPLIT_SUPABASE_URL = sourceUrl;
  process.env.PRAWNSPLIT_SUPABASE_SECRET_KEY = secret;
}
afterEach(() => {
  for (const [name, value] of Object.entries(prior)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("Supabase operated relay adapter", () => {
  it("keeps the existing backend unless the explicit server switch is set", async () => {
    delete process.env.PRAWNSPLIT_RELAY_BACKEND;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await handler(new Request(`https://relay.test/api/relay?tag=${tag}`));
    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves encryption and the HttpRelay API while forwarding only the commitment", async () => {
    configured();
    const key = await groupKey(new Uint8Array(32).fill(7));
    const blob = await encryptEnvelope(key, { type: "events", events: [] });
    const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const cursor = "9007199254740993-10";
    vi.stubGlobal("window", { location: { origin: "https://relay.test" } });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://relay.test")) return handler(new Request(url, options));
      const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
      calls.push({ url, headers: new Headers(options?.headers), body });
      return Response.json(url.endsWith("_append") ? cursor : [{ cursor, blob, author: "device-a" }]);
    }));
    const client = new HttpRelay("https://relay.test/api/relay");
    await expect(client.publish(tag, "device-a", blob, proof)).resolves.toEqual({ ok: true, cursor });
    const rows = await client.fetch(tag, { limit: 500 });
    expect(rows).toEqual([{ cursor, blob, author: "device-a" }]);
    await expect(decryptEnvelope(key, rows[0]!.blob)).resolves.toEqual({ type: "events", events: [] });
    expect(calls[0]!.body).toEqual({ p_tag: tag, p_commitment: await writeProofCommitment(proof), p_blob: blob, p_author: "device-a" });
    expect(JSON.stringify(calls[0]!.body)).not.toContain(proof);
    expect(calls[0]!.headers.get("apikey")).toBe(secret);
    expect(calls[0]!.headers.has("authorization")).toBe(false);
  });

  it("rejects wrong commitments without acknowledging a write", async () => {
    configured(); vi.stubGlobal("fetch", vi.fn(async () => Response.json(null)));
    const response = await handler(new Request("https://relay.test/api/relay", { method: "POST",
      body: JSON.stringify({ tag, writeProof: proof, author: "device-a", blob: "ciphertext" }) }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid proof" });
  });

  it("keeps provider details and server keys out of application errors", async () => {
    configured(); vi.stubGlobal("fetch", vi.fn(async () => new Response(`database detail ${secret}`, { status: 500 })));
    const response = await handler(new Request(`https://relay.test/api/relay?tag=${tag}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "relay storage unavailable" });
  });

  it("validates cursors before storage and rejects malformed success responses", async () => {
    configured(); const fetcher = vi.fn(async () => Response.json([{ cursor: "1-0", blob: 4, author: "device-a" }]));
    vi.stubGlobal("fetch", fetcher);
    const response = await handler(new Request(`https://relay.test/api/relay?tag=${tag}&cursor=18446744073709551616-0`));
    expect(response.status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
    await expect(new SupabaseRelayStore(sourceUrl, secret).read(tag, null, 100, null)).rejects.toThrow("invalid relay storage response");
  });

  it("supports legacy service JWT headers and refuses redirect forwarding", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _options?: RequestInit) => Response.json([]));
    await new SupabaseRelayStore(sourceUrl, "fixture.legacy.jwt", fetcher).read(tag, null, 9999, null);
    const options = fetcher.mock.calls[0]![1] as RequestInit;
    expect(options.redirect).toBe("error");
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer fixture.legacy.jwt");
    expect(JSON.parse(String(options.body)).p_limit).toBe(500);
  });

  it.each(["fetch", "body"])("bounds a non-cooperative %s stall and cancels its signal", async (phase) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: string | URL | Request, options?: RequestInit): Promise<Response> => {
      signal = options?.signal ?? undefined;
      return phase === "fetch" ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream({ start() {} })));
    });
    const result = new SupabaseRelayStore(sourceUrl, secret, fetcher).read(tag, null, 100, null);
    const assertion = expect(result).rejects.toThrow("relay storage unavailable");
    await vi.advanceTimersByTimeAsync(8_001);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects oversized storage bodies", async () => {
    const fetcher = vi.fn(async () => new Response("x".repeat(2100001)));
    await expect(new SupabaseRelayStore(sourceUrl, secret, fetcher).read(tag, null, 500, null)).rejects.toThrow("unavailable");
  });

  it.each([200, 503])("cleans the deadline after an early HTTP %i response", async (status) => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => Response.json([], { status }));
    const operation = new SupabaseRelayStore(sourceUrl, secret, fetcher).read(tag, null, 500, null);
    if (status === 200) await expect(operation).resolves.toEqual([]);
    else await expect(operation).rejects.toThrow("relay storage unavailable");
    expect(vi.getTimerCount()).toBe(0);
  });
});
