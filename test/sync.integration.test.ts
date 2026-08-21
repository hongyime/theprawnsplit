import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { canonicalStateBytes, fold, type Event } from "@theprawnsplit/core";
import { decryptEnvelope, encryptEnvelope, encryptEvents, type RelayEnvelope } from "@/crypto/envelope";
import { createGroupSecret, groupKey, groupTag, secretFromBase64, secretToBase64 } from "@/crypto/group";
import { appendEvents, createJoinSeed, ensureGroup, markEvents, readGroup, resetRepositoryForTests, syncCounts } from "@/db/repo";
import { defaultParticipant, makeEvent, makeExpenseFinancials, type EventFactory } from "@/lib/events";
import { publishQuorumReached, relayFetchPlans, syncOnce } from "@/relay/sync";
import type { AckResult, Relay, RelayEntry } from "@/relay/types";

type ParticipantAdded = Extract<Event, { t: "ParticipantAdded" }>;

class MemoryRelay implements Relay {
  entries = new Map<string, RelayEntry[]>();
  fetches: { tag: string; opts: { author?: string; cursor?: string | null; limit?: number } }[] = [];
  writes: { tag: string; author: string; blob: string; writeProof: string }[] = [];

  constructor(readonly name: string, private alive = true) {}

  async publish(tag: string, author: string, blob: string, writeProof = ""): Promise<AckResult> {
    if (!this.alive) return { ok: false, reason: `${this.name} down` };
    const entries = this.entries.get(tag) ?? [];
    const cursor = `${this.name}:${entries.length + 1}`;
    this.writes.push({ tag, author, blob, writeProof });
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

class DuplicateAckRelay extends MemoryRelay {
  override async publish(tag: string, author: string, blob: string, writeProof = ""): Promise<AckResult> {
    const stored = await super.publish(tag, author, blob, writeProof);
    return { ok: false, reason: `duplicate: already stored at ${stored.cursor ?? "unknown"}` };
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

function participantEvents(deviceId: string, start: number, count: number): Event[] {
  return Array.from({ length: count }, (_, index) =>
    event(deviceId, start + index, "ParticipantAdded", {
      pid: `p_${start + index}`,
      name: `Person ${start + index}`,
    }),
  );
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
  it("uses the configured acknowledgement quorum for publish success", () => {
    expect(publishQuorumReached(1, 1)).toBe(true);
    expect(publishQuorumReached(1, 2)).toBe(false);
    expect(publishQuorumReached(2, 2)).toBe(true);
  });

  it("treats duplicate publish acknowledgements as successful quorum members", async () => {
    await resetRepositoryForTests("prawn-duplicate-ack-quorum");
    const group = await ensureGroup();
    const participant = defaultParticipant({ deviceId: group.deviceId, nextCounter: group.nextCounter }, "Alice");
    await appendEvents(group.groupId, [participant]);

    const duplicate = new DuplicateAckRelay("duplicate");
    const live = new MemoryRelay("live");
    const result = await syncOnce(group.groupId, [duplicate, live]);

    expect(result.errors).not.toContain("relay quorum not reached (2/2 acknowledgements)");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ relay: "duplicate", code: "duplicate", actionKind: "treat-as-success" })]),
    );
    expect(result).toMatchObject({ published: 2, confirmed: 2 });
    expect(await syncCounts(group.groupId)).toEqual({ local: 0, published: 0, confirmed: 2 });
  });

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

  it("publishes encrypted relay payloads without transmitting the raw group secret", async () => {
    const relays = [new MemoryRelay("operated"), new MemoryRelay("nostr")];

    await resetRepositoryForTests(`prawn-relay-secret-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const participant = defaultParticipant({ deviceId: group.deviceId, nextCounter: group.nextCounter }, "Alice");
    await appendEvents(group.groupId, [participant]);

    await expect(syncOnce(group.groupId, relays)).resolves.toMatchObject({ confirmed: 2 });
    const secretText = (await readGroup(group.groupId)).secretB64;
    const writes = relays.flatMap((relay) => relay.writes);

    expect(writes).toHaveLength(2);
    for (const write of writes) {
      expect(JSON.stringify(write)).not.toContain(secretText);
      expect(write.tag).toHaveLength(64);
      expect(write.tag).not.toBe(secretText);
      expect(write.writeProof).toHaveLength(64);
      expect(write.writeProof).not.toBe(secretText);
    }
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

  it("publishes snapshots only after the covered raw events are confirmed", async () => {
    const relays = [new MemoryRelay("r1"), new MemoryRelay("r2")];

    await resetRepositoryForTests("prawn-confirmed-snapshot-boundary");
    const group = await ensureGroup();
    await appendEvents(group.groupId, participantEvents(group.deviceId, group.nextCounter, 99));

    const first = await syncOnce(group.groupId, relays);
    expect(first).toMatchObject({ confirmed: 50, snapshotsPublished: 0 });
    expect((await readGroup(group.groupId)).meta.lastSnapshotSeq).toBeUndefined();

    const second = await syncOnce(group.groupId, relays);
    expect(second).toMatchObject({ confirmed: 50, snapshotsPublished: 1 });
    expect((await readGroup(group.groupId)).meta.lastSnapshotSeq).toBe(100);

    const key = await groupKey(secretFromBase64((await readGroup(group.groupId)).secretB64));
    const snapshots: RelayEnvelope[] = [];
    for (const entry of relays[0]!.entries.get((await readGroup(group.groupId)).tagHex) ?? []) {
      const envelope = await decryptEnvelope(key, entry.blob);
      if (envelope.type === "snapshot") snapshots.push(envelope);
    }
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ type: "snapshot", seq: 100, vv: { [group.deviceId]: 100 } });
  }, 20_000);

  it("does not mark snapshots published before the configured acknowledgement quorum", async () => {
    const relays = [new MemoryRelay("alive", true), new MemoryRelay("down", false)];

    await resetRepositoryForTests("prawn-snapshot-quorum");
    const group = await ensureGroup();
    const events = participantEvents(group.deviceId, group.nextCounter, 100);
    const withEvents = await appendEvents(group.groupId, events);
    await markEvents(group.groupId, withEvents.events.map((event) => event.id), "confirmed");

    const result = await syncOnce(group.groupId, relays);
    const afterSync = await readGroup(group.groupId);

    expect(result.snapshotsPublished).toBe(0);
    expect(afterSync.meta.lastSnapshotSeq).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ relay: "down", operation: "snapshot" })]),
    );
  }, 20_000);

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

  it("retains unsupported schema events, freezes fold state, and advances transport cursors", async () => {
    const secret = createGroupSecret();
    const key = await groupKey(secret);
    const tag = await groupTag(secret);
    const relay = new MemoryRelay("operated");
    const futureEvent = {
      ...event("future_device", 1, "ParticipantAdded", { pid: "future_alice", name: "Future Alice" }),
      v: 99,
    } as Event;
    await relay.publish(tag, futureEvent.dev, await encryptEvents(key, [futureEvent]));

    await resetRepositoryForTests("prawn-future-schema-freeze");
    const group = await ensureGroup({
      secretB64: secretToBase64(secret),
      tagHex: tag,
      name: "Trip",
      currency: "USD",
    });

    await expect(syncOnce(group.groupId, [relay])).resolves.toMatchObject({ received: 1 });
    const recovered = await readGroup(group.groupId);
    const oldFold = fold(recovered.events, { supportedVersion: 2 });
    expect(recovered.events.map((stored) => stored.id)).toContain(futureEvent.id);
    expect(oldFold).toMatchObject({ frozen: true, quarantined: [futureEvent.id] });
    expect(oldFold.participants.has("future_alice")).toBe(false);
    expect(recovered.meta.versionVector.future_device).toBe(1);
    expect(recovered.meta.cursors["operated:topic"]).toBe("operated:1");

    await expect(syncOnce(group.groupId, [relay])).resolves.toMatchObject({ received: 0 });
    const afterAuthorCursor = await readGroup(group.groupId);
    expect(afterAuthorCursor.meta.cursors["operated:author:future_device"]).toBe("operated:1");

    await expect(syncOnce(group.groupId, [relay])).resolves.toMatchObject({ received: 0 });
    expect(relay.fetches.at(-1)?.opts).toMatchObject({ author: "future_device", cursor: "operated:1", limit: 500 });
  });

  it("stops refetching surplus events after drop vectors and author cursors advance", async () => {
    const secret = createGroupSecret();
    const key = await groupKey(secret);
    const tag = await groupTag(secret);
    const relay = new MemoryRelay("operated");
    const injected = Array.from({ length: 51 }, (_, index) =>
      event("throwaway_device", index + 1, "ExpenseAdded", {
        xid: `throwaway-${index + 1}`,
        financials: {
          minor: 1n,
          payers: [{ pid: "ghost", minor: 1n }],
          shares: [{ pid: "ghost", minor: 1n }],
        },
        desc: `Throwaway ${index + 1}`,
        at: index + 1,
        date: "2026-08-22",
      }),
    );
    await relay.publish(tag, "throwaway_device", await encryptEvents(key, injected));

    await resetRepositoryForTests("prawn-drop-refetch-loop");
    const group = await ensureGroup({
      secretB64: secretToBase64(secret),
      tagHex: tag,
      name: "Trip",
      currency: "USD",
    });

    await expect(syncOnce(group.groupId, [relay])).resolves.toMatchObject({ received: 50, dropped: 1 });
    const afterTopicBootstrap = await readGroup(group.groupId);
    expect(afterTopicBootstrap.meta.versionVector.throwaway_device).toBe(51);
    expect(afterTopicBootstrap.meta.discardVector.throwaway_device).toBe(51);
    expect(afterTopicBootstrap.meta.cursors["operated:topic"]).toBe("operated:1");

    await expect(syncOnce(group.groupId, [relay])).resolves.toMatchObject({ received: 0, dropped: 51 });
    const afterAuthorCursor = await readGroup(group.groupId);
    expect(afterAuthorCursor.meta.discardVector.throwaway_device).toBe(51);
    expect(afterAuthorCursor.meta.cursors["operated:author:throwaway_device"]).toBe("operated:1");

    await expect(syncOnce(group.groupId, [relay])).resolves.toMatchObject({ received: 0, dropped: 0 });
    expect(relay.fetches.at(-1)?.opts).toMatchObject({ author: "throwaway_device", cursor: "operated:1", limit: 500 });
  });
});
