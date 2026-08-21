import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { appendEvents, ensureGroup, markEvents, readGroup, resetRepositoryForTests, syncCounts, updateMeta } from "@/db/repo";
import { defaultParticipant, type EventFactory } from "@/lib/events";

const NOSTR_SECRET_RE = /^[0-9a-f]{64}$/;

describe("sync state metadata", () => {
  it("stores a valid device-local Nostr secret and repairs older invalid metadata", async () => {
    await resetRepositoryForTests(`sync-nostr-key-${crypto.randomUUID()}`);
    const group = await ensureGroup();

    expect(group.meta.nostrSk).toMatch(NOSTR_SECRET_RE);

    await updateMeta(group.groupId, (meta) => ({ ...meta, nostrSk: "too-short" }));
    const repaired = await readGroup(group.groupId);
    expect(repaired.meta.nostrSk).toMatch(NOSTR_SECRET_RE);
    expect(repaired.meta.nostrSk).not.toBe("too-short");

    const persisted = await readGroup(group.groupId);
    expect(persisted.meta.nostrSk).toBe(repaired.meta.nostrSk);
  });

  it("keeps unsyncedSince until every outbound event is confirmed", async () => {
    await resetRepositoryForTests(`sync-state-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const factory: EventFactory = { deviceId: group.deviceId, nextCounter: group.nextCounter };
    const alice = defaultParticipant(factory, "Alice");
    const bob = defaultParticipant({ ...factory, nextCounter: factory.nextCounter + 1 }, "Bob");
    const withEvents = await appendEvents(group.groupId, [alice, bob]);

    expect(withEvents.meta.unsyncedSince).toBeDefined();
    await markEvents(group.groupId, [group.events[0]!.id, alice.id], "confirmed");
    const partiallyConfirmed = await readGroup(group.groupId);
    expect(partiallyConfirmed.meta.unsyncedSince).toBeDefined();
    expect(await syncCounts(group.groupId)).toEqual({ local: 1, published: 0, confirmed: 2 });

    await markEvents(group.groupId, [bob.id], "published");
    const stillPending = await readGroup(group.groupId);
    expect(stillPending.meta.unsyncedSince).toBeDefined();
    expect(await syncCounts(group.groupId)).toEqual({ local: 0, published: 1, confirmed: 2 });

    await markEvents(group.groupId, [bob.id], "confirmed");
    const fullyConfirmed = await readGroup(group.groupId);
    expect(fullyConfirmed.meta.unsyncedSince).toBeUndefined();
    expect(await syncCounts(group.groupId)).toEqual({ local: 0, published: 0, confirmed: 3 });
  });
});
