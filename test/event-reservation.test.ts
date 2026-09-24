import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  appendReservedEvents,
  ensureGroup,
  readGroup,
  reserveEventIds,
  resetRepositoryForTests,
} from "@/db/repo";
import { makeEvent } from "@/lib/events";

// CONC-001: the old factory()/commit() path let a UI factory copy a stale
// nextCounter and appendEvents used overwrite (put) semantics, so two
// concurrent actions could mint the SAME event id and the second one to
// commit would silently replace the first's event. reserveEventIds +
// appendReservedEvents is the new, atomic two-phase allocator: reserve a
// counter range transactionally FIRST, build/sign the event OUTSIDE any
// transaction, then insert with collision checks (add(), not put()).

describe("CONC-001 atomic event identity reservation", () => {
  it("gives concurrent reservations non-overlapping counter ranges", async () => {
    await resetRepositoryForTests(`conc-001-parallel-${crypto.randomUUID()}`);
    const group = await ensureGroup();

    const [a, b] = await Promise.all([
      reserveEventIds(group.groupId, "command-a", 1),
      reserveEventIds(group.groupId, "command-b", 1),
    ]);
    expect(a.counters).toHaveLength(1);
    expect(b.counters).toHaveLength(1);
    expect(a.counters[0]).not.toBe(b.counters[0]);

    const after = await readGroup(group.groupId);
    expect(after.nextCounter).toBe(group.nextCounter + 2);
  });

  it("returns the SAME reservation for a retried command instead of allocating a new, overlapping range", async () => {
    await resetRepositoryForTests(`conc-001-retry-${crypto.randomUUID()}`);
    const group = await ensureGroup();

    const first = await reserveEventIds(group.groupId, "retry-command", 2);
    const afterFirst = await readGroup(group.groupId);
    const second = await reserveEventIds(group.groupId, "retry-command", 2);
    const afterSecond = await readGroup(group.groupId);

    expect(second.counters).toEqual(first.counters);
    expect(afterSecond.nextCounter).toBe(afterFirst.nextCounter); // did not advance again
  });

  it("delivers a reserved event, then clears the reservation without regressing nextCounter", async () => {
    await resetRepositoryForTests(`conc-001-deliver-${crypto.randomUUID()}`);
    const group = await ensureGroup();

    const reservation = await reserveEventIds(group.groupId, "deliver-command", 1);
    const event = makeEvent(
      { deviceId: reservation.deviceId, nextCounter: reservation.counters[0]! },
      "ParticipantAdded",
      { pid: "p1", name: "Alice" },
    );
    const delivered = await appendReservedEvents(group.groupId, "deliver-command", [event]);

    expect(delivered.events.map((e) => e.id)).toContain(event.id);
    expect(delivered.reservations?.["deliver-command"]).toBeUndefined();
    expect(delivered.nextCounter).toBeGreaterThanOrEqual(reservation.counters[0]! + 1);
  });

  it("rejects a genuine id collision instead of silently overwriting the earlier event's content", async () => {
    await resetRepositoryForTests(`conc-001-collision-${crypto.randomUUID()}`);
    const group = await ensureGroup();

    const reservation = await reserveEventIds(group.groupId, "collision-command", 1);
    const counter = reservation.counters[0]!;
    const original = makeEvent({ deviceId: reservation.deviceId, nextCounter: counter }, "ParticipantAdded", { pid: "p1", name: "Original" });
    await appendReservedEvents(group.groupId, "collision-command", [original]);

    // Simulate a second, unrelated caller somehow reusing the SAME counter
    // (the defensive backstop reservation itself should prevent, but must
    // still be enforced at insertion time).
    const colliding = makeEvent({ deviceId: reservation.deviceId, nextCounter: counter }, "ParticipantAdded", { pid: "p2", name: "Colliding" });
    await expect(appendReservedEvents(group.groupId, "another-command", [colliding])).rejects.toThrow();

    const after = await readGroup(group.groupId);
    const stored = after.events.find((e) => e.id === original.id);
    expect(stored).toMatchObject({ t: "ParticipantAdded", pid: "p1", name: "Original" });
  });
});
