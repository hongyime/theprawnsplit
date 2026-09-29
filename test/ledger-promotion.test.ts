import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dueBufferedEvents, bufferedEventIds, ensureGroup, promoteLedger, putBufferedEvents, removeBufferedEvents, readGroup, resetRepositoryForTests } from "@/db/repo";
import { makeEvent } from "@/lib/events";

// INTR-001: removeBufferedEvents previously committed in its OWN separate
// transaction, BEFORE event insertion and related vector/cursor metadata in
// LATER separate transactions. A crash/interruption between them could
// permanently lose the only retained copy of an event that had already
// been buffered past its originating relay page's cursor (the relay will
// never re-serve an entry once the cursor has moved past it). promoteLedger
// combines admitted-event insertion, promoted-buffer removal, newly-
// buffered additions, and vector/cursor/observedHlc metadata into ONE
// atomic transaction, so an event is always either still safely in the
// buffer store or fully admitted -- never removed from one without landing
// in the other.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("INTR-001 atomic ledger promotion", () => {
  it("promotes a buffered event into the events store, removing it from the buffer, and merges vector/cursor metadata", async () => {
    await resetRepositoryForTests(`intr-001-basic-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const event = makeEvent({ deviceId: "remote-peer", nextCounter: 1 }, "ParticipantAdded", { pid: "p1", name: "Remote" });
    await putBufferedEvents(group.groupId, [{ event, retryAt: 0 }]);

    const promoted = await promoteLedger(group.groupId, {
      admitted: [event],
      promotedBufferIds: [event.id],
      newlyBuffered: [],
      transportVector: { "remote-peer": 1 },
      discardVector: {},
      cursorUpdates: { "operated:topic": "cursor-1" },
    });

    expect(promoted.events.map((e) => e.id)).toContain(event.id);
    expect(promoted.meta.cursors["operated:topic"]).toBe("cursor-1");
    expect(promoted.meta.versionVector["remote-peer"]).toBe(1);
    const stillBuffered = await dueBufferedEvents(group.groupId);
    expect(stillBuffered.map((e) => e.id)).not.toContain(event.id);
  });

  it("moves a still-future event from admitted-candidate back into a re-buffered retry slot in the SAME call", async () => {
    await resetRepositoryForTests(`intr-001-rebuffer-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const event = makeEvent({ deviceId: "remote-peer", nextCounter: 1 }, "ParticipantAdded", { pid: "p1", name: "Remote" });
    await putBufferedEvents(group.groupId, [{ event, retryAt: 0 }]);

    const promoted = await promoteLedger(group.groupId, {
      admitted: [],
      promotedBufferIds: [event.id],
      newlyBuffered: [{ event, retryAt: Date.now() + 60_000 }],
      transportVector: {},
      discardVector: {},
    });

    expect(promoted.events.map((e) => e.id)).not.toContain(event.id);
    const stillBuffered = await dueBufferedEvents(group.groupId, Date.now() + 120_000);
    expect(stillBuffered.map((e) => e.id)).toContain(event.id);
  });

  it("never removes a buffer entry without durably admitting it, even when the transaction aborts partway through event insertion", async () => {
    await resetRepositoryForTests(`intr-001-fault-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const event = makeEvent({ deviceId: "remote-peer", nextCounter: 1 }, "ParticipantAdded", { pid: "p1", name: "Remote" });
    await putBufferedEvents(group.groupId, [{ event, retryAt: 0 }]);

    const originalPut = IDBObjectStore.prototype.put;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown, key?: unknown) {
      const request = originalPut.call(this, value, key as never);
      if (this.name === "events" && (value as { eventId?: string }).eventId === event.id) this.transaction.abort();
      return request;
    });

    await expect(
      promoteLedger(group.groupId, {
        admitted: [event],
        promotedBufferIds: [event.id],
        newlyBuffered: [],
        transportVector: { "remote-peer": 1 },
        discardVector: {},
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    putSpy.mockRestore();

    const after = await readGroup(group.groupId);
    expect(after.events.map((e) => e.id)).not.toContain(event.id); // never admitted
    const stillBuffered = await dueBufferedEvents(group.groupId);
    expect(stillBuffered.map((e) => e.id)).toContain(event.id); // STILL safely in the buffer -- never lost
  });

  it("records an admitted event's counter as durable coverage for its device", async () => {
    await resetRepositoryForTests(`data-007-promote-coverage-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const event = makeEvent({ deviceId: "remote-peer", nextCounter: 1 }, "ParticipantAdded", { pid: "p1", name: "Remote" });

    const promoted = await promoteLedger(group.groupId, {
      admitted: [event],
      promotedBufferIds: [],
      newlyBuffered: [],
      transportVector: { "remote-peer": 1 },
      discardVector: {},
    });

    expect(promoted.meta.coverage?.["remote-peer"]).toEqual([[1, 1]]);
  });

  it("does not record coverage for an event that was re-buffered instead of admitted in the same call", async () => {
    await resetRepositoryForTests(`data-007-rebuffer-no-coverage-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const event = makeEvent({ deviceId: "remote-peer", nextCounter: 1 }, "ParticipantAdded", { pid: "p1", name: "Remote" });
    await putBufferedEvents(group.groupId, [{ event, retryAt: 0 }]);

    const promoted = await promoteLedger(group.groupId, {
      admitted: [],
      promotedBufferIds: [event.id],
      newlyBuffered: [{ event, retryAt: Date.now() + 60_000 }],
      transportVector: {},
      discardVector: {},
    });

    // Still only buffered, never actually landed in the events store --
    // must not be credited as durably covered.
    expect(promoted.meta.coverage?.["remote-peer"]).toBeUndefined();
  });

  it("does not record coverage for an event whose admission transaction aborted partway through", async () => {
    await resetRepositoryForTests(`data-007-abort-no-coverage-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const event = makeEvent({ deviceId: "remote-peer", nextCounter: 1 }, "ParticipantAdded", { pid: "p1", name: "Remote" });
    await putBufferedEvents(group.groupId, [{ event, retryAt: 0 }]);

    const originalPut = IDBObjectStore.prototype.put;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown, key?: unknown) {
      const request = originalPut.call(this, value, key as never);
      if (this.name === "events" && (value as { eventId?: string }).eventId === event.id) this.transaction.abort();
      return request;
    });

    await expect(
      promoteLedger(group.groupId, {
        admitted: [event],
        promotedBufferIds: [event.id],
        newlyBuffered: [],
        transportVector: { "remote-peer": 1 },
        discardVector: {},
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    putSpy.mockRestore();

    const after = await readGroup(group.groupId);
    expect(after.meta.coverage?.["remote-peer"]).toBeUndefined();
  });
});

describe("PERF-001 bufferedEventIds (retained-row accounting across cycles)", () => {
  it("returns every retained row's id regardless of due status, unlike dueBufferedEvents", async () => {
    await resetRepositoryForTests(`perf-001-ids-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const due = makeEvent({ deviceId: "remote-peer", nextCounter: 1 }, "ParticipantAdded", { pid: "p1", name: "Due" });
    const notDue = makeEvent({ deviceId: "remote-peer", nextCounter: 2 }, "ParticipantAdded", { pid: "p2", name: "NotDue" });
    await putBufferedEvents(group.groupId, [{ event: due, retryAt: 0 }, { event: notDue, retryAt: Date.now() + 60_000 }]);

    const dueOnly = await dueBufferedEvents(group.groupId);
    expect(dueOnly.map((e) => e.id)).toEqual([due.id]);

    // bufferedEventIds must see BOTH -- the whole point is accounting for rows
    // still legitimately held (not-yet-due) that dueBufferedEvents deliberately
    // excludes, so a caller can derive existingBufferedCount = allIds.size -
    // dueBuffered.length without missing the still-held ones.
    const allIds = await bufferedEventIds(group.groupId);
    expect(allIds).toEqual(new Set([due.id, notDue.id]));
  });

  it("reflects removals -- a promoted/removed row no longer counts toward the retained total", async () => {
    await resetRepositoryForTests(`perf-001-ids-removed-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const event = makeEvent({ deviceId: "remote-peer", nextCounter: 1 }, "ParticipantAdded", { pid: "p1", name: "Remote" });
    await putBufferedEvents(group.groupId, [{ event, retryAt: Date.now() + 60_000 }]);
    expect(await bufferedEventIds(group.groupId)).toEqual(new Set([event.id]));

    await removeBufferedEvents(group.groupId, [event.id]);
    expect(await bufferedEventIds(group.groupId)).toEqual(new Set());
  });

  it("lets a caller derive existingBufferedCount that correctly excludes rows about to be re-evaluated as due", async () => {
    await resetRepositoryForTests(`perf-001-existing-count-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const due = makeEvent({ deviceId: "remote-peer", nextCounter: 1 }, "ParticipantAdded", { pid: "p1", name: "Due" });
    const stillHeld1 = makeEvent({ deviceId: "remote-peer", nextCounter: 2 }, "ParticipantAdded", { pid: "p2", name: "Held1" });
    const stillHeld2 = makeEvent({ deviceId: "remote-peer", nextCounter: 3 }, "ParticipantAdded", { pid: "p3", name: "Held2" });
    await putBufferedEvents(group.groupId, [
      { event: due, retryAt: 0 },
      { event: stillHeld1, retryAt: Date.now() + 60_000 },
      { event: stillHeld2, retryAt: Date.now() + 60_000 },
    ]);

    // Mirrors exactly what src/relay/sync.ts and migrated-sync.ts compute.
    const allIds = await bufferedEventIds(group.groupId);
    const dueBuffered = await dueBufferedEvents(group.groupId);
    const existingBufferedCount = Math.max(0, allIds.size - dueBuffered.length);

    expect(dueBuffered.map((e) => e.id)).toEqual([due.id]);
    expect(existingBufferedCount).toBe(2); // stillHeld1 + stillHeld2, NOT due
  });
});
