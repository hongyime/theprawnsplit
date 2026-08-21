import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { fold, greedySettlement } from "@theprawnsplit/core";
import { appendEvents, createExport, ensureGroup, replaceFromExport, resetRepositoryForTests } from "@/db/repo";
import { defaultParticipant, makeEvent, makeExpenseFinancials, type EventFactory } from "@/lib/events";
import { latestArchiveEvent } from "@/lib/lifecycle";

type ParticipantAdded = ReturnType<typeof defaultParticipant> & { t: "ParticipantAdded" };

describe("Phase 5 archive acceptance", () => {
  it("runs a local trip from creation to archived export restore with outstanding balances recorded", async () => {
    await resetRepositoryForTests(`phase5-archive-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    let factory: EventFactory = { deviceId: group.deviceId, nextCounter: group.nextCounter };
    const alice = defaultParticipant(factory, "Alice") as ParticipantAdded;
    const bob = defaultParticipant(factory, "Bob") as ParticipantAdded;
    const withPeople = await appendEvents(group.groupId, [alice, bob]);

    factory = { deviceId: withPeople.deviceId, nextCounter: withPeople.nextCounter };
    const dinner = makeEvent(factory, "ExpenseAdded", {
      xid: "dinner",
      financials: makeExpenseFinancials(1200n, alice.pid, [
        { pid: alice.pid, minor: 600n },
        { pid: bob.pid, minor: 600n },
      ]),
      desc: "Dinner",
      at: 1_787_280_000_000,
      date: "2026-08-21",
    });
    const activeTrip = await appendEvents(group.groupId, [dinner]);
    const activeState = fold(activeTrip.events, { supportedVersion: 2 });
    const outstanding = greedySettlement(activeState.balances);

    factory = { deviceId: activeTrip.deviceId, nextCounter: activeTrip.nextCounter };
    const archive = makeEvent(factory, "GroupArchived", { outstanding });
    const archivedTrip = await appendEvents(group.groupId, [archive]);

    await resetRepositoryForTests(`phase5-archive-restore-${crypto.randomUUID()}`);
    const restored = await replaceFromExport(createExport(archivedTrip));
    const restoredArchive = latestArchiveEvent(restored.events);
    const restoredState = fold(restored.events, { supportedVersion: 2 });

    expect(restored.events.map((event) => event.t)).toEqual(["GroupCreated", "ParticipantAdded", "ParticipantAdded", "ExpenseAdded", "GroupArchived"]);
    expect(restoredArchive?.outstanding).toEqual([{ from: bob.pid, to: alice.pid, minor: 600n }]);
    expect(restoredState.balances.get(alice.pid)).toBe(600n);
    expect(restoredState.balances.get(bob.pid)).toBe(-600n);
  });
});
