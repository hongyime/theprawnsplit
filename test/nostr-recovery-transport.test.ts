import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { fetchNostrRecoveryPage } from "@/relay/nostr-recovery-transport";

let socket: FakeSocket;
class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  sent: unknown[][] = [];
  closed = false;
  constructor() { socket = this; }
  send(message: string) { this.sent.push(JSON.parse(message)); }
  close() { this.closed = true; }
  frame(kind: string, value?: unknown) { this.onmessage?.({ data: JSON.stringify([kind, this.sent[0]?.[1], value]) }); }
}
const tag = "a".repeat(64);
const filter = { kinds: [1512], "#t": [tag], since: 0, until: 100, limit: 50 };
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("WebSocket", FakeSocket); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function start() {
  const request = fetchNostrRecoveryPage("wss://fixture.invalid", filter);
  await vi.advanceTimersByTimeAsync(0); socket.onopen?.();
  return { request };
}

describe("Nostr recovery wire completion", () => {
  it("accepts signed matching history only after a real EOSE and closes its own subscription", async () => {
    const { request } = await start();
    const event = finalizeEvent({ kind: 1512, created_at: 50, tags: [["t", tag]], content: "encrypted" }, generateSecretKey());
    socket.frame("EVENT", event); socket.frame("EVENT", event); socket.frame("EOSE");
    expect(await request).toEqual([{ cursor: "50", author: event.pubkey, blob: "encrypted" }]);
    expect(socket.sent.at(-1)?.[0]).toBe("CLOSE");
    expect(socket.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a socket close or timeout instead of treating it as empty completed history", async () => {
    const first = await start();
    const closed = expect(first.request).rejects.toThrow("before completing recovery");
    socket.onclose?.(); await closed;
    const second = await start();
    const timed = expect(second.request).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(15_000); await timed;
    expect(socket.closed).toBe(true);
  });

  it("rejects an altered signature or mismatched group and retains no verified page", async () => {
    const first = await start();
    const rejected = expect(first.request).rejects.toThrow("not verified");
    const signed = finalizeEvent({ kind: 1512, created_at: 50, tags: [["t", tag]], content: "encrypted" }, generateSecretKey());
    socket.frame("EVENT", { ...signed, content: "changed" }); socket.frame("EOSE"); await rejected;
    const second = await start();
    const wrongGroup = expect(second.request).rejects.toThrow("not verified");
    socket.frame("EVENT", finalizeEvent({ kind: 1512, created_at: 50, tags: [["t", "b".repeat(64)]], content: "encrypted" }, generateSecretKey()));
    await wrongGroup;
  });

  it("aborts an oversized wire response before accepting EOSE", async () => {
    const { request } = await start();
    const rejected = expect(request).rejects.toThrow("not verified");
    socket.onmessage?.({ data: "x".repeat(2_100_001) }); await rejected;
    expect(socket.closed).toBe(true);
  });
});
