// DATA-001: replaceFromExport previously always deleted every existing
// event row for the imported group id before inserting the file's events
// and replaced the group's identity/secret/meta wholesale. Importing an
// OLDER backup of a trip already on this device (e.g. from a stale phone
// backup) silently erased newer local history, the device's own secret,
// and its sync cursors/metadata. The fix matches by the cryptographic
// tagHex (the real identity of a trip) before local groupId, unions
// absent events into the existing group via upsertRemoteEvents (reusing
// DATA-005's same-id conflict detection), and only creates an isolated
// new local group when no tag match exists at all.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  appendEvents,
  createExport,
  ensureGroup,
  EventIdentityConflictError,
  readGroup,
  resetRepositoryForTests,
  replaceFromExport,
  type GroupRecord,
  type TripLedgerExport,
} from "@/db/repo";
import type { Event } from "@theprawnsplit/core";

function expenseEvent(dev: string, ctr: number, overrides: Partial<Event> = {}): Event {
  return {
    v: 1,
    id: `${dev}:${ctr}`,
    hlc: { wall: ctr, ctr, dev },
    dev,
    t: "ExpenseAdded",
    xid: `x${ctr}`,
    financials: { minor: 1000n, payers: [{ pid: "p1", minor: 1000n }], shares: [{ pid: "p1", minor: 1000n }] },
    desc: "Lunch",
    at: ctr,
    date: "2024-01-01",
    ...overrides,
  } as Event;
}

async function freshGroup(name: string): Promise<GroupRecord> {
  await resetRepositoryForTests(`import-preservation-${name}-${crypto.randomUUID()}`);
  return ensureGroup();
}

describe("replaceFromExport (DATA-001)", () => {
  it("unions absent events into the existing group with a matching tag, instead of replacing it", async () => {
    const group = await freshGroup("union");
    const newer = expenseEvent(group.deviceId, 50, { xid: "newer", desc: "Newer local expense" });
    const withNewer = await appendEvents(group.groupId, [newer]);

    // An OLDER export of the same trip, missing the newer local event and
    // stamped with a stale nextCounter -- simulates a stale backup file.
    const staleExport: TripLedgerExport = createExport(await readGroup(group.groupId));
    staleExport.events = withNewer.events.filter((event) => event.id !== newer.id);

    const restored = await replaceFromExport(staleExport);

    expect(restored.groupId).toBe(group.groupId);
    expect(restored.secretB64).toBe(group.secretB64);
    expect(restored.deviceId).toBe(group.deviceId);
    expect(restored.events.some((event) => event.id === newer.id)).toBe(true);
  });

  it("preserves the existing group's meta (cursors, version vector) rather than resetting it", async () => {
    const group = await freshGroup("meta-preserved");
    const reread = await readGroup(group.groupId);
    const staleExport: TripLedgerExport = createExport(reread);

    await replaceFromExport(staleExport);

    const after = await readGroup(group.groupId);
    expect(after.meta.nostrSk).toBe(reread.meta.nostrSk);
  });

  it("is idempotent: importing the exact same export twice adds nothing the second time", async () => {
    const group = await freshGroup("idempotent");
    const event1 = expenseEvent(group.deviceId, 50);
    await appendEvents(group.groupId, [event1]);
    const exported = createExport(await readGroup(group.groupId));

    await replaceFromExport(exported);
    const afterFirst = await readGroup(group.groupId);
    await replaceFromExport(exported);
    const afterSecond = await readGroup(group.groupId);

    expect(afterSecond.events.map((event) => event.id).sort()).toEqual(afterFirst.events.map((event) => event.id).sort());
  });

  it("rejects a genuinely conflicting same-id event instead of silently picking a winner, leaving the local copy untouched", async () => {
    const group = await freshGroup("conflict");
    const original = expenseEvent(group.deviceId, 50, { desc: "Lunch" });
    await appendEvents(group.groupId, [original]);
    const exported = createExport(await readGroup(group.groupId));
    exported.events = exported.events.map((event) => (event.id === original.id ? { ...event, desc: "Dinner" } : event));

    await expect(replaceFromExport(exported)).rejects.toThrow(EventIdentityConflictError);

    const after = await readGroup(group.groupId);
    expect(after.events.find((event) => event.id === original.id)).toMatchObject({ desc: "Lunch" });
  });

  it("refuses an import whose groupId collides with a different local trip's tag, touching neither group", async () => {
    const groupA = await freshGroup("collide-a");
    const exportedA = createExport(await readGroup(groupA.groupId));

    // A second, unrelated local trip that happens to reuse groupA's groupId
    // in its own export metadata (e.g. a corrupted or crafted file) but has
    // a genuinely different tag (a different trip's cryptographic identity).
    const forged: TripLedgerExport = { ...exportedA, group: { ...exportedA.group, tagHex: "f".repeat(64) } };

    await expect(replaceFromExport(forged)).rejects.toThrow(/collides/);

    const after = await readGroup(groupA.groupId);
    expect(after.events).toEqual(groupA.events);
  });

  it("still creates an isolated new local group when no existing trip matches the imported tag", async () => {
    const group = await freshGroup("no-match");
    const exported = createExport(await readGroup(group.groupId));
    exported.group = { ...exported.group, tagHex: "e".repeat(64), groupId: "g_unrelated" };

    const created = await replaceFromExport(exported);

    expect(created.groupId).not.toBe(group.groupId);
    // DATA-002: the stored tagHex is derived from the newly generated
    // secret, never copied verbatim from the import file (see
    // import-linkage.test.ts for the full DATA-002 coverage) -- this
    // no-match group is explicitly unlinked/offline, with the import
    // file's original tag preserved separately as sourceTagHex.
    expect(created.tagHex).not.toBe("e".repeat(64));
    expect(created.linked).toBe(false);
    expect(created.sourceTagHex).toBe("e".repeat(64));
    expect((await readGroup(group.groupId)).events).toEqual(group.events);
  });
});
