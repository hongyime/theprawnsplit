import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { SimplePool } from "nostr-tools";
import { createGroup, resetRepositoryForTests, updateMeta } from "@/db/repo";
import { syncOnce } from "@/relay/sync";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("releases the Nostr pool created for a complete sync cycle", async () => {
  await resetRepositoryForTests(`pool-lifecycle-${crypto.randomUUID()}`);
  const group = await createGroup("Synthetic Pool", "SGD");
  vi.spyOn(SimplePool.prototype, "publish").mockReturnValue([Promise.resolve("fixture accepted")]);
  vi.spyOn(SimplePool.prototype, "querySync").mockResolvedValue([]);
  const destroy = vi.spyOn(SimplePool.prototype, "destroy");
  vi.stubGlobal("window", { location: { origin: "https://fixture.invalid" } });
  let stored: { blob: string; author: string; cursor: string } | undefined;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input, "https://fixture.invalid");
    expect(url.origin).toBe("https://fixture.invalid"); expect(url.pathname).toBe("/api/relay");
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)); stored = { blob: body.blob, author: body.author, cursor: "fixture-1" };
      return new Response(JSON.stringify({ cursor: stored.cursor }));
    }
    return new Response(JSON.stringify({ entries: stored ? [stored] : [] }));
  }));
  const result = await syncOnce(group.groupId, undefined, { messageLimitBytes: null });
  expect(result.confirmed).toBe(1);
  expect(destroy).toHaveBeenCalledTimes(1);
});

it.each([{ urls: [] }, { urls: ["wss://configured.fixture.invalid"] }])("looks up limits only for the trip's configured relay URLs: %j", async ({ urls }) => {
  await resetRepositoryForTests(`pool-selection-${crypto.randomUUID()}`);
  const group = await createGroup("Synthetic Relay Selection", "SGD");
  await updateMeta(group.groupId, meta => ({ ...meta, relaySettings: { useOperated: true, operatedEndpoint: "/api/relay", nostrRelays: urls } }));
  vi.spyOn(SimplePool.prototype, "publish").mockReturnValue([Promise.resolve("fixture accepted")]);
  vi.spyOn(SimplePool.prototype, "querySync").mockResolvedValue([]);
  const destroy = vi.spyOn(SimplePool.prototype, "destroy");
  vi.stubGlobal("window", { location: { origin: "https://fixture.invalid" } });
  const lookups: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = new URL(input, "https://fixture.invalid");
    if (url.pathname === "/api/relay") return new Response(JSON.stringify({ cursor: "fixture-1", entries: [] }));
    lookups.push(url.href);
    return new Response(JSON.stringify({ limitation: { max_message_length: 131072 } }));
  }));
  await syncOnce(group.groupId);
  expect(lookups).toEqual(urls.map(url => url.replace("wss://", "https://") + "/"));
  expect(destroy).toHaveBeenCalledTimes(urls.length ? 1 : 0);
});
