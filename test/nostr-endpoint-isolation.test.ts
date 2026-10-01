import { describe, expect, it, vi, afterEach } from "vitest";
import { SimplePool } from "nostr-tools";
import { NostrRelay } from "@/relay/nostr";

const TAG = "a".repeat(64);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("REL-002 NostrRelay per-endpoint isolation (one bad relay URL never suppresses the others)", () => {
  it("reports per-URL outcomes from a single publish call instead of collapsing them into one aggregate result", async () => {
    const relay = new NostrRelay(undefined, ["wss://good.fixture.invalid", "wss://bad.fixture.invalid"]);
    vi.spyOn(SimplePool.prototype, "publish").mockReturnValue([
      Promise.resolve("fixture accepted"),
      Promise.reject(new Error("blocked: web of trust policy")),
    ]);

    const ack = await relay.publish(TAG, "author", "ciphertext", "proof");

    // The aggregate ack still reflects "at least one endpoint accepted it" --
    // continued good-peer progress despite the other endpoint's rejection.
    expect(ack.ok).toBe(true);
    const outcomes = relay.lastOutcomes();
    expect(outcomes.get("wss://good.fixture.invalid")).toEqual({ ok: true });
    expect(outcomes.get("wss://bad.fixture.invalid")).toMatchObject({ ok: false, reason: expect.stringContaining("blocked") });
  });

  it("skips a URL already marked backed-off in policy, attempting only the still-active URLs", async () => {
    const relay = new NostrRelay(undefined, ["wss://good.fixture.invalid", "wss://backed-off.fixture.invalid"]);
    relay.policy = { "wss://backed-off.fixture.invalid": { consecutiveFailures: 2, backoffUntil: Date.now() + 60_000 } };
    const publishSpy = vi.spyOn(SimplePool.prototype, "publish").mockReturnValue([Promise.resolve("fixture accepted")]);

    const ack = await relay.publish(TAG, "author", "ciphertext", "proof");

    expect(ack.ok).toBe(true);
    // Only the ONE active URL was ever attempted -- the backed-off one was
    // never even contacted this cycle.
    expect(publishSpy.mock.calls[0]?.[0]).toEqual(["wss://good.fixture.invalid"]);
  });

  it("skips a URL explicitly dropped in policy the same way, regardless of elapsed time", async () => {
    const relay = new NostrRelay(undefined, ["wss://good.fixture.invalid", "wss://dropped.fixture.invalid"]);
    relay.policy = { "wss://dropped.fixture.invalid": { consecutiveFailures: 9, dropped: true } };
    const publishSpy = vi.spyOn(SimplePool.prototype, "publish").mockReturnValue([Promise.resolve("fixture accepted")]);

    await relay.publish(TAG, "author", "ciphertext", "proof");

    expect(publishSpy.mock.calls[0]?.[0]).toEqual(["wss://good.fixture.invalid"]);
  });

  it("reports failure without ever contacting nostr-tools when every URL is currently backed off or dropped", async () => {
    const relay = new NostrRelay(undefined, ["wss://backed-off.fixture.invalid"]);
    relay.policy = { "wss://backed-off.fixture.invalid": { consecutiveFailures: 3, backoffUntil: Date.now() + 60_000 } };
    const publishSpy = vi.spyOn(SimplePool.prototype, "publish");

    const ack = await relay.publish(TAG, "author", "ciphertext", "proof");

    expect(ack.ok).toBe(false);
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("skips a backed-off URL on fetch too, querying only the still-active ones", async () => {
    const relay = new NostrRelay(undefined, ["wss://good.fixture.invalid", "wss://backed-off.fixture.invalid"]);
    relay.policy = { "wss://backed-off.fixture.invalid": { consecutiveFailures: 2, backoffUntil: Date.now() + 60_000 } };
    const querySpy = vi.spyOn(SimplePool.prototype, "querySync").mockResolvedValue([]);

    await relay.fetch(TAG, {});

    expect(querySpy.mock.calls[0]?.[0]).toEqual(["wss://good.fixture.invalid"]);
  });
});
