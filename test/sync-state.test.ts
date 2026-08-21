import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { appendEvents, ensureGroup, markEvents, readGroup, resetRepositoryForTests, syncCounts } from "@/db/repo";
import { defaultParticipant, type EventFactory } from "@/lib/events";

describe("sync state metadata", () => {
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
