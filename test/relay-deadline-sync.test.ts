import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createGroup, readGroup, resetRepositoryForTests, syncCounts, updateMeta } from "@/db/repo";
import { HttpRelay } from "@/relay/http";
import { syncOnce } from "@/relay/sync";

const realTimeout = globalThis.setTimeout;
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("keeps timed-out writes local and the read checkpoint intact, then confirms a real retry", async () => {
  await resetRepositoryForTests(`deadline-sync-${crypto.randomUUID()}`);
  const group = await createGroup("Fixture Retry", "SGD");
  await updateMeta(group.groupId, meta => ({ ...meta, cursors: { "operated:topic": "1000-7" } }));
  vi.stubGlobal("window", { location: { origin: "https://fixture.invalid" } });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let stalled = true;
  let stored: { cursor: string; blob: string; author: string } | undefined;
  const requests: Array<{ method: string; signal: AbortSignal; cursor: string | null }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input, "https://fixture.invalid");
    expect(url.origin).toBe("https://fixture.invalid");
    requests.push({ method: init?.method ?? "GET", signal: init?.signal as AbortSignal, cursor: url.searchParams.get("cursor") });
    if (stalled) return { ok: true, json: () => new Promise(() => {}) };
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      stored = { cursor: "1000-8", blob: body.blob, author: body.author };
      return new Response(JSON.stringify({ cursor: stored.cursor }));
    }
    return new Response(JSON.stringify({ entries: stored ? [stored] : [] }));
  }));
  const pending = syncOnce(group.groupId, [new HttpRelay("/api/relay")], { messageLimitBytes: null });
  // The existing algorithm attempts the batch, its single-event fallback, then
  // a read. Each stalls in the body. IDB/crypto use real task queues throughout.
  for (let count = 1; count <= 3; count++) {
    for (let tries = 0; requests.length < count && tries < 200; tries++) {
      await new Promise(resolve => realTimeout(resolve, 5));
    }
    expect(requests).toHaveLength(count);
    await vi.advanceTimersByTimeAsync(15_000);
  }
  const failed = await pending;
  expect(failed).toMatchObject({ published: 0, confirmed: 0, received: 0 });
  expect(failed.errors.join(" ")).toMatch(/timed out/);
  expect(requests.map(r => r.method)).toEqual(["POST", "POST", "GET"]);
  expect(requests.every(r => r.signal.aborted)).toBe(true);
  expect(await syncCounts(group.groupId)).toEqual({ local: 1, published: 0, confirmed: 0 });
  expect((await readGroup(group.groupId)).meta.cursors).toEqual({ "operated:topic": "1000-7" });
  stalled = false;
  const retried = await syncOnce(group.groupId, [new HttpRelay("/api/relay")], { messageLimitBytes: null });
  expect(retried).toMatchObject({ published: 1, confirmed: 1 });
  expect(requests.at(-1)?.cursor).toBe("1000-7");
  const after = await readGroup(group.groupId);
  expect(after.meta.cursors).toEqual({ "operated:topic": "1000-8" });
  expect(after.events.map(e => e.id)).toEqual(group.events.map(e => e.id));
  expect(await syncCounts(group.groupId)).toEqual({ local: 0, published: 0, confirmed: 1 });
  expect(vi.getTimerCount()).toBe(0);
});
