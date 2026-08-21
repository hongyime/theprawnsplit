import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { canonicalStateBytes, fold, type Event } from "@theprawnsplit/core";
import { decryptEnvelope, encryptEnvelope, encryptEvents, type RelayEnvelope } from "@/crypto/envelope";
import { createGroupSecret, groupKey, groupTag, secretToBase64 } from "@/crypto/group";
import { appendEvents, createJoinSeed, ensureGroup, readGroup, resetRepositoryForTests } from "@/db/repo";
import { defaultParticipant, makeEvent, makeExpenseFinancials, type EventFactory } from "@/lib/events";
import { syncOnce } from "@/relay/sync";
import type { AckResult, Relay, RelayEntry } from "@/relay/types";

type ParticipantAdded = Extract<Event, { t: "ParticipantAdded" }>;

class MemoryRelay implements Relay {
  entries = new Map<string, RelayEntry[]>();

  constructor(readonly name: string, private alive = true) {}

  async publish(tag: string, author: string, blob: string): Promise<AckResult> {
    if (!this.alive) return { ok: false, reason: `${this.name} down` };
    const entries = this.entries.get(tag) ?? [];
    const cursor = `${this.name}:${entries.length + 1}`;
    entries.push({ blob, author, cursor });
    this.entries.set(tag, entries);
    return { ok: true, cursor };
  }

  async fetch(tag: string): Promise<RelayEntry[]> {
    if (!this.alive) throw new Error(`${this.name} down`);
    return this.entries.get(tag) ?? [];
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
      for (const entry of await relay.fetch(tag)) {
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
