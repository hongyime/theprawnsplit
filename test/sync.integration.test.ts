import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { canonicalStateBytes, fold, type Event } from "@theprawnsplit/core";
import { decryptEnvelope, encryptEnvelope, encryptEvents, type RelayEnvelope } from "@/crypto/envelope";
import { createGroupSecret, groupKey, groupTag, secretToBase64 } from "@/crypto/group";
import { appendEvents, createJoinSeed, ensureGroup, markEvents, readGroup, resetRepositoryForTests, syncCounts } from "@/db/repo";
import { defaultParticipant, makeEvent, makeExpenseFinancials, type EventFactory } from "@/lib/events";
import { relayFetchPlans, syncOnce } from "@/relay/sync";
import type { AckResult, Relay, RelayEntry } from "@/relay/types";

type ParticipantAdded = Extract<Event, { t: "ParticipantAdded" }>;

class MemoryRelay implements Relay {
  entries = new Map<string, RelayEntry[]>();
  fetches: { tag: string; opts: { author?: string; cursor?: string | null; limit?: number } }[] = [];

  constructor(readonly name: string, private alive = true) {}

  async publish(tag: string, author: string, blob: string): Promise<AckResult> {
    if (!this.alive) return { ok: false, reason: `${this.name} down` };
    const entries = this.entries.get(tag) ?? [];
    const cursor = `${this.name}:${entries.length + 1}`;
    entries.push({ blob, author, cursor });
    this.entries.set(tag, entries);
    return { ok: true, cursor };
  }

  async fetch(tag: string, opts: { author?: string; cursor?: string | null; limit?: number } = {}): Promise<RelayEntry[]> {
    if (!this.alive) throw new Error(`${this.name} down`);
    this.fetches.push({ tag, opts });
    let entries = this.entries.get(tag) ?? [];
    if (opts.author) entries = entries.filter((entry) => entry.author === opts.author);
    if (opts.cursor) {
      const cursorIndex = entries.findIndex((entry) => entry.cursor === opts.cursor);
      entries = cursorIndex >= 0 ? entries.slice(cursorIndex + 1) : entries.filter((entry) => entry.cursor > opts.cursor!);
    }
    return entries.slice(0, opts.limit ?? entries.length);
  }
}

function event(dev: string, ctr: number, t: "ParticipantAdded" | "ExpenseAdded", payload: Record<string, unknown>): Event {
  return {
    v: 1,
    id: `${dev}:${ctr}`,
    hlc: { wall: ctr, ctr, dev },
    dev,
    t,
    vv: { [dev]: ctr },
    ...payload,
  } as Event;
}

async function publishEvents(relays: MemoryRelay[], key: CryptoKey, tag: string, author: string, events: Event[]): Promise<number> {
  const blob = await encryptEvents(key, events);
  const acks = await Promise.all(relays.map((relay) => relay.publish(tag, author, blob)));
  return acks.filter((ack) => ack.ok).length;
}

async function readEvents(relays: MemoryRelay[], key: CryptoKey, tag: string): Promise<Event[]> {
  const byId = new Map<string, Event>();
  for (const relay of relays) {
    try {
      for (const entry of await relay.fetch(tag, {})) {
        const envelope = await decryptEnvelope(key, entry.blob);
        if (envelope.type !== "events") continue;
        for (const event of envelope.events) byId.set(event.id, event);
      }
    } catch {
      // Down relays are expected in the loss-tolerance scenario.
    }
  }
  return [...byId.values()];
}

describe("Phase 2 sync integration", () => {
  it("plans topic bootstrap for empty logs and author-cursor fetches for populated operated logs", () => {
    const empty = {
      groupId: "g_empty",
      name: "Trip",
      currency: "USD",
      deviceId: "d_me",
      nextCounter: 1,
      createdAt: 1,
      secretB64: "secret",
      tagHex: "a".repeat(64),
      events: [],
      identities: [],
      meta: { groupId: "g_empty", versionVector: {}, discardVector: {}, cursors: {}, nostrSk: "1".repeat(64) },
    };
    expect(relayFetchPlans(empty, "operated")).toEqual([{ cursorKey: "operated:topic", opts: { limit: 500 } }]);

    const populated = {
      ...empty,
      events: [
        event("d_b", 1, "ParticipantAdded", { pid: "bob", name: "Bob" }),
        event("d_a", 1, "ParticipantAdded", { pid: "alice", name: "Alice" }),
      ],
      meta: {
        ...empty.meta,
        cursors: { "operated:author:d_a": "operated:7", "nostr:topic": "nostr:3" },
      },
    };

    expect(relayFetchPlans(populated, "operated")).toEqual([
      { cursorKey: "operated:author:d_a", opts: { author: "d_a", cursor: "operated:7", limit: 500 } },
      { cursorKey: "operated:author:d_b", opts: { author: "d_b", limit: 500 } },
    ]);
    expect(relayFetchPlans(populated, "nostr")).toEqual([{ cursorKey: "nostr:topic", opts: { cursor: "nostr:3", limit: 500 } }]);
  });

  it("decrypts legacy array blobs and new typed snapshot envelopes", async () => {
    const key = await groupKey(createGroupSecret());
    const added = event("a", 1, "ParticipantAdded", { pid: "alice", name: "Alice" });
    expect(await decryptEnvelope(key, await encryptEvents(key, [added]))).toEqual({ type: "events", events: [added] });

    const snapshot: RelayEnvelope = {
      type: "snapshot",
      seq: 100,
      vv: { a: 100 },
      state: { participants: [] },
      createdAt: 1,
    };
    expect(await decryptEnvelope(key, await encryptEnvelope(key, snapshot))).toEqual(snapshot);
  });

  it("converges three devices through two surviving relays", async () => {
    const secret = createGroupSecret();
    const key = await groupKey(secret);
    const tag = await groupTag(secret);
    const relays = [
      new MemoryRelay("r1", true),
      new MemoryRelay("r2", false),
      new MemoryRelay("r3", false),
      new MemoryRelay("r4", true),
      new MemoryRelay("r5", false),
    ];
    const alice = event("a", 1, "ParticipantAdded", { pid: "alice", name: "Alice" });
    const bob = event("b", 1, "ParticipantAdded", { pid: "bob", name: "Bob" });
    const dinner = event("c", 1, "ExpenseAdded", {
      xid: "dinner",
      financials: {
        minor: 1200n,
        payers: [{ pid: "alice", minor: 1200n }],
        shares: [
          { pid: "alice", minor: 600n },
          { pid: "bob", minor: 600n },
        ],
      },
      desc: "Dinner",
      at: 1,
      date: "2026-08-21",
    });

    await expect(publishEvents(relays, key, tag, "a", [alice])).resolves.toBe(2);
    await expect(publishEvents(relays, key, tag, "b", [bob])).resolves.toBe(2);
    await expect(publishEvents(relays, key, tag, "c", [dinner])).resolves.toBe(2);

    const merged = await readEvents(relays, key, tag);
    const expected = canonicalStateBytes(fold([alice, bob, dinner], { supportedVersion: 1 }));
    expect(canonicalStateBytes(fold(merged, { supportedVersion: 1 }))).toBe(expected);
  });

  it("recovers a wiped IndexedDB device through a join seed and topic-only relay fetch", async () => {
    const relays = [new MemoryRelay("r1"), new MemoryRelay("r2")];

    await resetRepositoryForTests("prawn-device-a");
    const groupA = await ensureGroup();
    let factory: EventFactory = { deviceId: groupA.deviceId, nextCounter: groupA.nextCounter };
    const alice = defaultParticipant(factory, "Alice") as ParticipantAdded;
    const bob = defaultParticipant(factory, "Bob") as ParticipantAdded;
    const withPeople = await appendEvents(groupA.groupId, [alice, bob]);
    factory = { deviceId: withPeople.deviceId, nextCounter: withPeople.nextCounter };
    const dinner = makeEvent(factory, "ExpenseAdded", {
      xid: "dinner",
      financials: makeExpenseFinancials(1200n, alice.pid, [
        { pid: alice.pid, minor: 600n },
        { pid: bob.pid, minor: 600n },
      ]),
      desc: "Dinner",
      at: 1,
      date: "2026-08-21",
    });
    const syncedA = await appendEvents(groupA.groupId, [dinner]);
    await expect(syncOnce(groupA.groupId, relays)).resolves.toMatchObject({ confirmed: 4 });
    const seed = createJoinSeed(syncedA);

    await resetRepositoryForTests("prawn-device-b-wiped");
    const groupB = await ensureGroup(seed);
    expect(groupB.events).toHaveLength(0);
    await expect(syncOnce(groupB.groupId, relays)).resolves.toMatchObject({ received: 4 });
    const recovered = await readGroup(groupB.groupId);

    expect(canonicalStateBytes(fold(recovered.events, { supportedVersion: 1 }))).toBe(
      canonicalStateBytes(fold((await readGroup(groupA.groupId).catch(() => syncedA)).events, { supportedVersion: 1 })),
    );
    expect(recovered.meta.versionVector[groupA.deviceId]).toBeGreaterThanOrEqual(4);
    expect(relays[0]!.fetches.at(-1)?.opts).toEqual({ limit: 500 });
  });

  it("persists operated relay author cursors for populated incremental fetches", async () => {
    const operated = new MemoryRelay("operated");
    const spare = new MemoryRelay("spare");
    const relays = [operated, spare];

    await resetRepositoryForTests("prawn-operated-cursors");
    const groupA = await ensureGroup();
    const alice = defaultParticipant({ deviceId: groupA.deviceId, nextCounter: groupA.nextCounter }, "Alice");
    await appendEvents(groupA.groupId, [alice]);
    await expect(syncOnce(groupA.groupId, relays)).resolves.toMatchObject({ confirmed: 2 });
    const afterFirstSync = await readGroup(groupA.groupId);
    const cursorKey = `operated:author:${groupA.deviceId}`;
    expect(afterFirstSync.meta.cursors[cursorKey]).toBe("operated:1");
    expect(operated.fetches.at(-1)?.opts).toMatchObject({ author: groupA.deviceId, limit: 500 });

    const next = makeEvent({ deviceId: groupA.deviceId, nextCounter: afterFirstSync.nextCounter }, "ParticipantAdded", {
      pid: "p_cursor",
      name: "Cursor",
    });
    await appendEvents(groupA.groupId, [next]);
    await expect(syncOnce(groupA.groupId, relays)).resolves.toMatchObject({ confirmed: 1 });
    expect(operated.fetches.at(-1)?.opts).toMatchObject({ author: groupA.deviceId, cursor: "operated:1", limit: 500 });
    expect((await readGroup(groupA.groupId)).meta.cursors[cursorKey]).toBe("operated:2");
  });

  it("keeps local outbound events pending when publish quorum is unreachable", async () => {
    await resetRepositoryForTests("prawn-no-publish-quorum");
    const group = await ensureGroup();
    const participant = defaultParticipant({ deviceId: group.deviceId, nextCounter: group.nextCounter }, "Alice");
    await appendEvents(group.groupId, [participant]);

    const relays = [new MemoryRelay("alive", true), new MemoryRelay("down", false)];
    const result = await syncOnce(group.groupId, relays);

    expect(result).toMatchObject({ published: 0, confirmed: 0 });
    expect(result.errors).toContain("relay quorum not reached (1/2 acknowledgements)");
    expect(await syncCounts(group.groupId)).toEqual({ local: 2, published: 0, confirmed: 0 });
    expect((await readGroup(group.groupId)).meta.unsyncedSince).toBeDefined();
  });

  it("confirms already-published events from read-back without requiring a fresh publish quorum", async () => {
    await resetRepositoryForTests("prawn-published-readback");
    const group = await ensureGroup();
    const participant = defaultParticipant({ deviceId: group.deviceId, nextCounter: group.nextCounter }, "Alice");
    const withParticipant = await appendEvents(group.groupId, [participant]);
    await markEvents(group.groupId, withParticipant.events.map((event) => event.id), "published");

    const relays = [new MemoryRelay("alive", true), new MemoryRelay("down", false)];
    const result = await syncOnce(group.groupId, relays);

    expect(result).toMatchObject({ published: 0, confirmed: 2 });
    expect(result.errors).not.toContain("relay quorum not reached (1/2 acknowledgements)");
    expect(await syncCounts(group.groupId)).toEqual({ local: 0, published: 0, confirmed: 2 });
    expect((await readGroup(group.groupId)).meta.unsyncedSince).toBeUndefined();
  });

  it("uses snapshot-only bootstrap for transport vectors without creating semantic state", async () => {
    const secret = createGroupSecret();
    const key = await groupKey(secret);
    const tag = await groupTag(secret);
    const relay = new MemoryRelay("snapshot-only");
    const snapshot: RelayEnvelope = {
      type: "snapshot",
      seq: 100,
      vv: { old_device: 100 },
      state: { participants: [["alice"]] },
      createdAt: 1,
    };
    await relay.publish(tag, "old_device", await encryptEnvelope(key, snapshot));

    await resetRepositoryForTests("prawn-snapshot-only-bootstrap");
    const group = await ensureGroup({
      secretB64: secretToBase64(secret),
      tagHex: tag,
      name: "Trip",
      currency: "USD",
    });
    await expect(syncOnce(group.groupId, [relay])).resolves.toMatchObject({ snapshotsSeen: 1, received: 0 });
    const recovered = await readGroup(group.groupId);

    expect(recovered.events).toHaveLength(0);
    expect(fold(recovered.events, { supportedVersion: 1 }).participants.size).toBe(0);
    expect(recovered.meta.versionVector.old_device).toBe(100);
  });
});
