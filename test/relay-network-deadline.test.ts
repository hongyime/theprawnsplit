import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRelay } from "@/relay/http";
import { clearNip11CacheForTests, fetchMaxMessageLength } from "@/relay/nip11";

beforeEach(() => {
  vi.useFakeTimers(); clearNip11CacheForTests();
  vi.stubGlobal("window", { location: { origin: "https://fixture.test" } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("relay request deadlines cover headers and bodies", () => {
  for (const operation of ["publish", "fetch", "nip11"] as const) {
    for (const phase of ["headers", "json", "error-body"] as const) {
      if (operation === "nip11" && phase === "error-body") continue;
      it(`${operation} settles and aborts stalled ${phase} after 15 seconds`, async () => {
        let signal: AbortSignal | undefined;
        const forever = () => new Promise<never>(() => {}); // deliberately ignores abort
        const transport = vi.fn((_url: unknown, init?: RequestInit) => {
          signal = init?.signal ?? undefined;
          return phase === "headers" ? forever() : Promise.resolve({
            ok: phase !== "error-body", json: forever, text: forever,
          } as unknown as Response);
        });
        vi.stubGlobal("fetch", transport);
        const relay = new HttpRelay("/api/relay");
        const request = operation === "publish" ? relay.publish("fixture", "author", "blob", "proof")
          : operation === "fetch" ? relay.fetch("fixture", { cursor: "original", limit: 50 })
            : fetchMaxMessageLength("wss://fixture.test", transport as typeof fetch);
        let outcome: { value?: unknown; error?: unknown } | undefined;
        void request.then(value => { outcome = { value }; }, error => { outcome = { error }; });
        await vi.advanceTimersByTimeAsync(14_999); expect(outcome).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        expect(outcome).toBeDefined();
        expect(signal?.aborted).toBe(true);
        if (operation === "nip11") expect(outcome).toEqual({ value: null });
        else expect(String(outcome?.error)).toMatch(/timed out|timeout/i);
        expect(vi.getTimerCount()).toBe(0);
      });
    }
  }

  it("preserves successful ACKs, cursors and NIP-11 limits and clears deadlines", async () => {
    const signals: AbortSignal[] = [];
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Response(JSON.stringify({ cursor: "opaque-123", entries: [{ cursor: "opaque-456", blob: "data", author: "fixture" }], limitation: { max_message_length: 131072 } }));
    });
    vi.stubGlobal("fetch", transport);
    const relay = new HttpRelay("/api/relay");
    expect(await relay.publish("fixture", "author", "blob", "proof")).toEqual({ ok: true, cursor: "opaque-123" });
    expect(await relay.fetch("fixture", { cursor: "opaque-0", author: "fixture", limit: 50 })).toEqual([{ cursor: "opaque-456", blob: "data", author: "fixture" }]);
    expect(await fetchMaxMessageLength("wss://fixture.test", transport)).toBe(131072);
    expect(signals).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
    expect(new URL(String(transport.mock.calls[1]![0])).searchParams.get("cursor")).toBe("opaque-0");
  });
});
