// DATA-005: upsertRemoteEvents previously skipped any incoming event whose
// ID already existed locally WITHOUT ever comparing content — a same-ID,
// different-content event (opposite arrival order across two devices, a
// replay, or a corrupted/malicious peer) would be silently discarded,
// letting two replicas permanently disagree about what a given event id
// means while each device believes its own copy is authoritative.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { ensureGroup, resetRepositoryForTests, upsertRemoteEvents, readGroup, EventIdentityConflictError } from "@/db/repo";
import { eventFingerprint } from "@/lib/event-fingerprint";
import type { Event } from "@theprawnsplit/core";

async function freshGroup() {
  await resetRepositoryForTests(`event-identity-conflict-${crypto.randomUUID()}`);
  return ensureGroup();
}

type ExpenseAddedEvent = Event & { t: "ExpenseAdded" };
function expenseEvent(dev: string, overrides: Partial<ExpenseAddedEvent> = {}): ExpenseAddedEvent {
  return {
    v: 1,
    id: "conflict-id-1",
    hlc: { wall: 1_800_000_000_000, ctr: 1, dev },
    dev,
    t: "ExpenseAdded",
    xid: "x1",
    financials: { minor: 1000n, payers: [{ pid: "p1", minor: 1000n }], shares: [{ pid: "p1", minor: 1000n }] },
    desc: "Lunch",
    at: 1_800_000_000_000,
    date: "2024-01-01",
    ...overrides,
  };
}

describe("eventFingerprint (shared canonical behavior)", () => {
  it("is stable regardless of key order", async () => {
    const a = expenseEvent("d1");
    const reordered = { desc: a.desc, t: a.t, hlc: a.hlc, id: a.id, v: a.v, dev: a.dev, xid: a.xid, financials: a.financials, at: a.at, date: a.date } as Event;
    expect(await eventFingerprint(a)).toBe(await eventFingerprint(reordered));
  });

  it("differs when content differs", async () => {
    const a = expenseEvent("d1");
    const b = expenseEvent("d1", { desc: "Dinner" });
    expect(await eventFingerprint(a)).not.toBe(await eventFingerprint(b));
  });
});

describe("upsertRemoteEvents — same-ID content conflicts (DATA-005)", () => {
  it("inserts a genuinely new event and returns an added count of 1", async () => {
    const group = await freshGroup();
    const event = expenseEvent(group.deviceId, { id: `${group.deviceId}:99` });
    const added = await upsertRemoteEvents(group.groupId, [event]);
    expect(added).toBe(1);
    const reread = await readGroup(group.groupId);
    expect(reread.events.some((e) => e.id === event.id)).toBe(true);
  });

  it("is idempotent for an exact repeat of an already-stored event", async () => {
    const group = await freshGroup();
    const event = expenseEvent(group.deviceId, { id: `${group.deviceId}:99` });
    await upsertRemoteEvents(group.groupId, [event]);
    const secondAdded = await upsertRemoteEvents(group.groupId, [{ ...event }]);
    expect(secondAdded).toBe(0);
    const reread = await readGroup(group.groupId);
    expect(reread.events.filter((e) => e.id === event.id)).toHaveLength(1);
  });

  it("rejects a same-ID event whose content differs, instead of silently discarding either side", async () => {
    const group = await freshGroup();
    const original = expenseEvent(group.deviceId, { id: `${group.deviceId}:99`, desc: "Lunch" });
    const conflicting = expenseEvent(group.deviceId, { id: `${group.deviceId}:99`, desc: "Dinner" });
    await upsertRemoteEvents(group.groupId, [original]);

    await expect(upsertRemoteEvents(group.groupId, [conflicting])).rejects.toThrow(EventIdentityConflictError);

    // The original, authoritative copy must survive untouched -- no arbitrary winner.
    const reread = await readGroup(group.groupId);
    const stored = reread.events.find((e) => e.id === original.id);
    expect(stored).toMatchObject({ desc: "Lunch" });
  });

  it("rejects the WHOLE batch transactionally when a conflict appears anywhere in it, leaving earlier events in the same batch unwritten too", async () => {
    const group = await freshGroup();
    const original = expenseEvent(group.deviceId, { id: `${group.deviceId}:99`, desc: "Lunch" });
    await upsertRemoteEvents(group.groupId, [original]);

    const harmless = expenseEvent(group.deviceId, { id: `${group.deviceId}:100`, xid: "x2", desc: "Coffee" });
    const conflicting = expenseEvent(group.deviceId, { id: `${group.deviceId}:99`, desc: "Dinner" });

    await expect(upsertRemoteEvents(group.groupId, [harmless, conflicting])).rejects.toThrow(EventIdentityConflictError);

    const reread = await readGroup(group.groupId);
    // The harmless event that preceded the conflict in the same batch must
    // NOT have been partially committed -- the whole batch is one transaction.
    expect(reread.events.some((e) => e.id === harmless.id)).toBe(false);
  });

  it("EventIdentityConflictError carries both the existing and incoming event for explicit reconciliation", async () => {
    const group = await freshGroup();
    const original = expenseEvent(group.deviceId, { id: `${group.deviceId}:99`, desc: "Lunch" });
    const conflicting = expenseEvent(group.deviceId, { id: `${group.deviceId}:99`, desc: "Dinner" });
    await upsertRemoteEvents(group.groupId, [original]);

    try {
      await upsertRemoteEvents(group.groupId, [conflicting]);
      expect.unreachable("expected a conflict to be thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(EventIdentityConflictError);
      const conflictError = error as EventIdentityConflictError;
      expect(conflictError.eventId).toBe(original.id);
      expect(conflictError.existing).toMatchObject({ desc: "Lunch" });
      expect(conflictError.incoming).toMatchObject({ desc: "Dinner" });
    }
  });
});
