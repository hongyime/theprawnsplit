import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { appendEvents, ensureGroup, resetRepositoryForTests, syncCounts } from "@/db/repo";
import { defaultParticipant } from "@/lib/events";
import type { Event } from "@theprawnsplit/core";
import { syncOnce, type SyncOnceOptions } from "@/relay/sync";
import type { AckResult, Relay, RelayEntry } from "@/relay/types";

// CR-011 Task 6 — A13 mitigation integration coverage.
//
// The mitigation has two halves: size the outbound batch against the smallest
// known relay message limit (slicing the pending queue), and fall back to
// per-event publishes when the batched write cannot reach quorum (the
// load-bearing half — CR-010 measured relays rejecting or partially
// acknowledging batch messages even under their byte caps).

class MemoryRelay implements Relay {
  private stored: RelayEntry[] = [];
  constructor(readonly name: string) {}
  async publish(_tag: string, author: string, blob: string): Promise<AckResult> {
    this.stored.push({ blob, author, cursor: `cursor-${this.stored.length + 1}` });
    return { ok: true, cursor: `cursor-${this.stored.length}` };
  }
  async fetch(_tag: string, opts: { author?: string; cursor?: string | null; limit?: number } = {}): Promise<RelayEntry[]> {
    let entries = this.stored;
    if (opts.author) entries = entries.filter((entry) => entry.author === opts.author);
    if (opts.cursor) {
      const cursorIndex = entries.findIndex((entry) => entry.cursor === opts.cursor);
      entries = cursorIndex >= 0 ? entries.slice(cursorIndex + 1) : [];
    }
    return entries;
  }
}

class MaxBytesRelay extends MemoryRelay {
  constructor(name: string, private readonly maxBytes: number) {
    super(name);
  }
  override async publish(tag: string, author: string, blob: string): Promise<AckResult> {
    if (blob.length > this.maxBytes) return { ok: false, reason: `message too large (>${this.maxBytes})` };
    return super.publish(tag, author, blob);
  }
}

const limitOptions = (limit: number): SyncOnceOptions => ({ messageLimitBytes: limit });

async function seedGroupWithParticipants(name: string, count: number): Promise<string> {
  await resetRepositoryForTests(name);
  const group = await ensureGroup();
  const events: Event[] = [];
  let nextCounter = group.nextCounter;
  for (let index = 0; index < count; index += 1) {
    const participant = defaultParticipant({ deviceId: group.deviceId, nextCounter }, `Person ${index}`);
    nextCounter += 1;
    events.push(participant);
  }
  await appendEvents(group.groupId, events);
  return group.groupId;
}

describe("A13 batch-size mitigation", () => {
  it("slices an oversized batch to fit the message limit and publishes the remainder next cycle", { timeout: 30_000 }, async () => {
    const groupId = await seedGroupWithParticipants("a13-slice", 6);

    // A deliberately tiny limit forces a slice: not every pending event fits.
    const first = await syncOnce(groupId, [new MemoryRelay("a"), new MemoryRelay("b")], limitOptions(5000));
    expect(first.errors).not.toContain("relay quorum not reached (2/2 acknowledgements)");
    expect(first.published).toBeGreaterThan(0);
    expect(first.published).toBeLessThan(7); // something was left pending

    // The remainder flows out on a later cycle once the limit allows.
    const second = await syncOnce(groupId, [new MemoryRelay("a2"), new MemoryRelay("b2")]);
    expect(second.published).toBeGreaterThan(0);
    expect(await syncCounts(groupId)).toEqual({ local: 0, published: 0, confirmed: 7 });
  });

  it("falls back to per-event publishes when the batched write cannot reach quorum", { timeout: 30_000 }, async () => {
    const groupId = await seedGroupWithParticipants("a13-fallback", 4);

    // Batched multi-event blobs exceed these relays' tolerance; single-event
    // messages fit. Quorum fails on the batch, so every event must still be
    // published individually rather than stranded in the outbox.
    const strict = [new MaxBytesRelay("strict-a", 700), new MaxBytesRelay("strict-b", 700)];
    const result = await syncOnce(groupId, strict);

    expect(result.published).toBe(5);
    expect(await syncCounts(groupId)).toEqual({ local: 0, published: 0, confirmed: 5 });
  });
});
