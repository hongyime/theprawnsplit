import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const SRC = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const ORIGIN = "https://prawn.test";

function loadSW(opts: { network: (url: string) => Response | Promise<Response> }) {
  const listeners: Record<string, (e: any) => void> = {};
  const store = new Map<string, Response>();
  const fetchCalls: string[] = [];

  const cache = {
    match: async (req: any) => store.get(urlOf(req)),
    put: async (req: any, res: Response) => void store.set(urlOf(req), res),
    addAll: async (urls: string[]) => {
      for (const u of urls) store.set(ORIGIN + u, new Response("SHELL-CACHED"));
    },
  };
  const caches = {
    open: async () => cache,
    keys: async () => [...cacheNames],
    delete: async (k: string) => cacheNames.delete(k),
    match: async (req: any) => cache.match(req),
  };
  const cacheNames = new Set<string>();

  const fakeFetch = vi.fn(async (req: any) => {
    const u = urlOf(req);
    fetchCalls.push(u);
    return opts.network(u);
  });

  const self: any = {
    location: { origin: ORIGIN },
    addEventListener: (t: string, fn: any) => void (listeners[t] = fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    caches,
  };

  new Function("self", "caches", "fetch", "Response", "URL", SRC)(
    self, caches, fakeFetch, Response, URL,
  );

  return { listeners, store, fetchCalls, fakeFetch };
}

function urlOf(req: any) {
  return typeof req === "string" ? req : req.url;
}

// Dispatch a fetch event and return whatever the SW responded with (or undefined
// if it declined to handle the request).
async function dispatchFetch(
  listeners: Record<string, any>,
  url: string,
  mode: "navigate" | "cors" = "cors",
) {
  let responded: Promise<Response> | undefined;
  listeners.fetch({
    request: { url, method: "GET", mode, clone: () => ({}) },
    respondWith: (p: Promise<Response>) => void (responded = p),
  });
  return responded ? await responded : undefined;
}

describe("service worker — shell freshness (CR-003 regression)", () => {
  it("serves a FRESH shell after redeploy, never the cached copy", async () => {
    const { listeners, store } = loadSW({
      network: () => new Response("SHELL-NEW"),
    });
    // Simulate a returning visitor: old shell already cached
    store.set(ORIGIN + "/", new Response("SHELL-OLD"));

    const res = await dispatchFetch(listeners, ORIGIN + "/", "navigate");
    expect(await res!.text()).toBe("SHELL-NEW");
  });

  it("falls back to the cached shell when the network is unavailable", async () => {
    const { listeners, store } = loadSW({
      network: () => { throw new Error("offline"); },
    });
    store.set(ORIGIN + "/", new Response("SHELL-CACHED"));

    const res = await dispatchFetch(listeners, ORIGIN + "/", "navigate");
    expect(await res!.text()).toBe("SHELL-CACHED");
  });

  it("serves the working cached shell when navigation receives HTTP 503", async () => {
    const { listeners, store } = loadSW({ network: () => new Response("UNAVAILABLE", { status: 503 }) });
    store.set(ORIGIN + "/", new Response("WORKING-SHELL"));

    const response = await dispatchFetch(listeners, ORIGIN + "/", "navigate");

    expect(response?.status).toBe(200);
    expect(await response?.clone().text()).toBe("WORKING-SHELL");
    expect(await store.get(ORIGIN + "/")?.clone().text()).toBe("WORKING-SHELL");
  });

  it("preserves the working shell for offline navigation after an HTTP failure", async () => {
    let offline = false;
    const { listeners, store } = loadSW({ network: () => {
      if (offline) throw new Error("offline");
      return new Response("UNAVAILABLE", { status: 503 });
    } });
    store.set(ORIGIN + "/", new Response("WORKING-SHELL"));
    await dispatchFetch(listeners, ORIGIN + "/", "navigate");
    offline = true;

    const response = await dispatchFetch(listeners, ORIGIN + "/", "navigate");

    expect(response?.status).toBe(200);
    expect(await response?.clone().text()).toBe("WORKING-SHELL");
  });

  it("returns an unsuccessful navigation response without caching it when no shell exists", async () => {
    const { listeners, store } = loadSW({ network: () => new Response("UNAVAILABLE", { status: 503 }) });

    const response = await dispatchFetch(listeners, ORIGIN + "/", "navigate");

    expect(response?.status).toBe(503);
    expect(store.has(ORIGIN + "/")).toBe(false);
  });

  it("does not cache an unsuccessful hashed-asset response", async () => {
    const { listeners, store } = loadSW({ network: () => new Response("MISSING", { status: 404 }) });
    const asset = ORIGIN + "/assets/missing.js";

    const response = await dispatchFetch(listeners, asset);

    expect(response?.status).toBe(404);
    expect(store.has(asset)).toBe(false);
  });

  it("recovers an asset previously cached with an unsuccessful status", async () => {
    const { listeners, store, fetchCalls } = loadSW({ network: () => new Response("RECOVERED-ASSET") });
    const asset = ORIGIN + "/assets/index-abc123.js";
    store.set(asset, new Response("OLD-ERROR", { status: 503 }));

    const response = await dispatchFetch(listeners, asset);

    expect(response?.status).toBe(200);
    expect(await response?.clone().text()).toBe("RECOVERED-ASSET");
    expect(fetchCalls).toEqual([asset]);
  });

  it("serves hashed assets from cache without touching the network", async () => {
    const { listeners, store, fetchCalls } = loadSW({
      network: () => new Response("FROM-NETWORK"),
    });
    const asset = ORIGIN + "/assets/index-abc123.js";
    store.set(asset, new Response("FROM-CACHE"));

    const res = await dispatchFetch(listeners, asset);
    expect(await res!.text()).toBe("FROM-CACHE");
    expect(fetchCalls).toHaveLength(0);
  });

  it("never caches relay API responses", async () => {
    const { listeners } = loadSW({ network: () => new Response("{}") });
    const res = await dispatchFetch(listeners, ORIGIN + "/api/relay?tag=abc");
    expect(res).toBeUndefined();   // SW declines to handle it at all
  });

  it("ignores cross-origin requests", async () => {
    const { listeners } = loadSW({ network: () => new Response("x") });
    const res = await dispatchFetch(listeners, "https://relay.damus.io/thing");
    expect(res).toBeUndefined();
  });
});

describe("service worker — configuration shape", () => {
  it("declares a versioned cache name", () => {
    // Shape, not value: bumping to v4 is a normal change and MUST NOT fail a test.
    expect(SRC).toMatch(/const CACHE_NAME = "theprawnsplit-v\d+";/);
  });

  it("purges caches from previous versions on activate", () => {
    expect(SRC).toContain("caches.delete");
    expect(SRC).toMatch(/key !== CACHE_NAME/);
  });

  it("does not depend on background sync or push (REQ-PLT-03, REQ-PLT-04)", () => {
    expect(SRC).not.toMatch(/\b(?:SyncManager|PeriodicSyncManager|PushManager|Notification)\b/);
    expect(SRC).not.toMatch(/\.(?:sync|periodicSync|pushManager)\.(?:register|subscribe)\b/);
  });
});
