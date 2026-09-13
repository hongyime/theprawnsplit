import { afterEach, expect, it, vi } from "vitest";
import { SimplePool } from "nostr-tools";
import { HttpRelay } from "@/relay/http";
import { NostrRelay } from "@/relay/nostr";
import { clearNip11CacheForTests, fetchMaxMessageLength } from "@/relay/nip11";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); clearNip11CacheForTests(); });

it("cancels an HTTP response body when the shared deadline expires", async () => {
  const controller = new AbortController(); let observed!: AbortSignal;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    observed = init.signal as AbortSignal;
    return { ok: true, json: () => new Promise(() => {}) };
  }));
  const pending = new HttpRelay("https://fixture.invalid").publish("tag", "author", "blob", "proof", { signal: controller.signal });
  const assertion = expect(pending).rejects.toThrow("fixture cycle expired");
  controller.abort(new Error("fixture cycle expired"));
  await assertion; expect(observed.aborted).toBe(true);
});

it.each(["publish", "fetch"] as const)("closes stalled Nostr %s connections at the request deadline", async operation => {
  vi.useFakeTimers();
  let resolve!: (value: any) => void;
  const stalled = new Promise<any>(done => { resolve = done; });
  vi.spyOn(SimplePool.prototype, "publish").mockReturnValue([stalled]);
  vi.spyOn(SimplePool.prototype, "querySync").mockReturnValue(stalled);
  const destroy = vi.spyOn(SimplePool.prototype, "destroy");
  const relay = new NostrRelay("01".repeat(32), ["wss://fixture.invalid"]);
  const pending = operation === "publish" ? relay.publish("ab".repeat(32), "author", "blob") : relay.fetch("ab".repeat(32), {});
  const outcome = pending.then(value => ({ value }), error => ({ error }));
  try {
    await vi.advanceTimersByTimeAsync(15_000);
    expect(destroy).toHaveBeenCalledTimes(1);
    const result = await outcome;
    if (operation === "publish") expect(result).toMatchObject({ value: { ok: false, reason: expect.stringMatching(/timed out/) } });
    else expect(result).toMatchObject({ error: expect.objectContaining({ message: expect.stringMatching(/timed out/) }) });
    expect(vi.getTimerCount()).toBe(0);
  } finally { resolve(operation === "publish" ? "late fixture ACK" : []); await outcome; }
});

it("does not cache an aborted NIP-11 lookup and retries it with a fresh deadline", async () => {
  const controller = new AbortController(); let observed!: AbortSignal;
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    observed = init?.signal as AbortSignal;
    return { ok: true, json: () => new Promise(() => {}) } as Response;
  });
  const pending = fetchMaxMessageLength("wss://nip11.fixture.invalid", fetcher, controller.signal);
  const assertion = expect(pending).rejects.toThrow("fixture cycle expired");
  controller.abort(new Error("fixture cycle expired"));
  await assertion; expect(observed.aborted).toBe(true);
  fetcher.mockResolvedValue(new Response(JSON.stringify({ limitation: { max_message_length: 12345 } })));
  expect(await fetchMaxMessageLength("wss://nip11.fixture.invalid", fetcher)).toBe(12345);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
