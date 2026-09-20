import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { appendEvents, createGroup, getGroupCrypto, readGroup, resetRepositoryForTests, syncCounts, updateMeta, markEvents } from "@/db/repo";
import { decryptEnvelope } from "@/crypto/envelope";
import { defaultParticipant } from "@/lib/events";
import { syncOnce } from "@/relay/sync";
import type { Relay, RelayEntry } from "@/relay/types";

const realTimeout = globalThis.setTimeout;
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("preserves concurrent metadata updates when recording fallback progress", async () => {
  await resetRepositoryForTests(`atomic-sync-meta-${crypto.randomUUID()}`);
  const group = await createGroup("Synthetic Metadata", "SGD");
  await Promise.all([
    updateMeta(group.groupId, meta => ({ ...meta, syncFallbackNextId: "next-fixture-event" })),
    updateMeta(group.groupId, meta => ({ ...meta, lastSyncAt: 12345 })),
  ]);
  const refreshed = await readGroup(group.groupId);
  expect(refreshed.meta.syncFallbackNextId).toBe("next-fixture-event");
  expect(refreshed.meta.lastSyncAt).toBe(12345);
  expect(refreshed.events).toEqual(group.events);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

it("coalesces overlapping same-trip syncs without publishing or checkpointing twice", async () => {
  await resetRepositoryForTests(`same-trip-cycle-${crypto.randomUUID()}`);
  const group = await createGroup("Synthetic Sync", "SGD");
  const entered = deferred(); const release = deferred();
  let publishes = 0; let fetches = 0; const entries: RelayEntry[] = [];
  const relay: Relay = {
    name: "fixture",
    async publish(_tag, author, blob) { publishes++; entries.push({ author, blob, cursor: String(publishes) }); return { ok: true }; },
    async fetch() { fetches++; if (fetches === 1) { entered.resolve(); await release.promise; } return [...entries]; },
  };
  const first = syncOnce(group.groupId, [relay], { messageLimitBytes: null });
  let second: ReturnType<typeof syncOnce> | undefined;
  try {
    await entered.promise;
    second = syncOnce(group.groupId, [relay], { messageLimitBytes: null });
    const completedEarly = await Promise.race([second.then(() => true), new Promise<boolean>(done => setTimeout(() => done(false), 1000))]);
    expect(completedEarly).toBe(false);
    expect(publishes).toBe(1); expect(fetches).toBe(1);
  } finally { release.resolve(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
  expect(await syncCounts(group.groupId)).toEqual({ local: 0, published: 0, confirmed: 1 });
  expect((await readGroup(group.groupId)).events.map(event => event.id)).toEqual(group.events.map(event => event.id));
});

it("does not confirm a different event that failed quorum merely because another event published", async () => {
  await resetRepositoryForTests(`confirmation-membership-${crypto.randomUUID()}`);
  const group = await createGroup("Synthetic Confirmation", "SGD");
  const extra = [0, 1].map(index => defaultParticipant({ deviceId: group.deviceId, nextCounter: group.nextCounter + index }, `Fixture ${index}`));
  await appendEvents(group.groupId, extra);
  const { key } = await getGroupCrypto(group);
  const winningId = group.events[0]!.id; const insufficientId = extra[0]!.id;
  const makeRelay = (name: string): Relay => {
    const entries: RelayEntry[] = [];
    return { name, async publish(_tag, author, blob) {
      const envelope = await decryptEnvelope(key, blob);
      if (envelope.type !== "events" || envelope.events.length !== 1) return { ok: false, reason: "fixture batch rejection" };
      const id = envelope.events[0]!.id;
      const ok = id === winningId || (name === "left" && id === insufficientId);
      if (ok) entries.push({ blob, author, cursor: String(entries.length + 1) });
      return { ok, ...(ok ? {} : { reason: "fixture rejection" }) };
    }, async fetch() { return [...entries]; } };
  };
  const result = await syncOnce(group.groupId, [makeRelay("left"), makeRelay("right")], { messageLimitBytes: null });
  expect(result.published).toBe(1); expect(result.confirmed).toBe(1);
  expect(await syncCounts(group.groupId)).toEqual({ local: 2, published: 0, confirmed: 1 });
  expect((await readGroup(group.groupId)).events.map(event => event.id)).toEqual([...group.events, ...extra].map(event => event.id));
});

it.each(["publish", "fetch"] as const)("ends stalled %s work within the cycle budget without applying a late result", async operation => {
  await resetRepositoryForTests(`network-budget-${crypto.randomUUID()}`);
  const group = await createGroup("Synthetic Budget", "SGD");
  const entered = deferred(); const release = deferred(); let publishes = 0; let fetches = 0;
  const entries: RelayEntry[] = [];
  const relay: Relay = { name: "fixture", async publish(_tag, author, blob) {
    publishes++; entries.push({ author, blob, cursor: "late-fixture" });
    if (operation === "publish") { entered.resolve(); await release.promise; }
    return { ok: true };
  }, async fetch() { fetches++; entered.resolve(); await release.promise; return entries; } };
  const counts = operation === "publish" ? { local: 1, published: 0, confirmed: 0 } : { local: 0, published: 1, confirmed: 0 };
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let completed = false;
  const pending = syncOnce(group.groupId, [relay], { messageLimitBytes: null, networkBudgetMs: 100 }).then(result => { completed = true; return result; });
  try {
    await entered.promise; await vi.advanceTimersByTimeAsync(100);
    for (let i = 0; i < 100 && !completed; i++) await new Promise(done => realTimeout(done, 5));
    expect(completed).toBe(true);
    expect(await syncCounts(group.groupId)).toEqual(counts);
    expect(publishes).toBe(1); expect(fetches).toBe(operation === "publish" ? 0 : 1);
    expect((await pending).errors.join(" ")).toMatch(/time limit|timed out/);
  } finally { release.resolve(); await pending; }
  expect(await syncCounts(group.groupId)).toEqual(counts);
  expect((await readGroup(group.groupId)).meta.cursors).toEqual({});
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds fallback traffic and makes later pending events progress on the next cycle", async () => {
  await resetRepositoryForTests(`fallback-budget-${crypto.randomUUID()}`);
  const group = await createGroup("Synthetic Outbox", "SGD");
  const extra = Array.from({ length: 12 }, (_, index) => defaultParticipant({ deviceId: group.deviceId, nextCounter: group.nextCounter + index }, `Fixture ${index}`));
  await appendEvents(group.groupId, extra);
  const { key } = await getGroupCrypto(group); const entries: RelayEntry[] = []; let singleWrites = 0;
  const relay: Relay = { name: "fixture", async publish(_tag, author, blob) {
    const envelope = await decryptEnvelope(key, blob);
    if (envelope.type !== "events" || envelope.events.length !== 1) return { ok: false, reason: "fixture batch rejection" };
    singleWrites++; entries.push({ blob, author, cursor: String(entries.length + 1) }); return { ok: true };
  }, async fetch() { return [...entries]; } };
  const first = await syncOnce(group.groupId, [relay], { messageLimitBytes: null });
  expect(singleWrites).toBe(10); expect(first.published).toBe(10);
  expect(await syncCounts(group.groupId)).toEqual({ local: 3, published: 0, confirmed: 10 });
  await syncOnce(group.groupId, [relay], { messageLimitBytes: null });
  expect(singleWrites).toBe(13);
  expect(await syncCounts(group.groupId)).toEqual({ local: 0, published: 0, confirmed: 13 });
  expect((await readGroup(group.groupId)).events).toHaveLength(13);
});

it("rotates past permanently rejected events and the primary batch boundary", async () => {
  await resetRepositoryForTests(`fallback-fairness-${crypto.randomUUID()}`);
  const group = await createGroup("Synthetic Fairness", "SGD");
  const extra = Array.from({ length: 60 }, (_, index) => defaultParticipant({ deviceId: group.deviceId, nextCounter: group.nextCounter + index }, `Fixture ${index}`));
  await appendEvents(group.groupId, extra);
  const before = (await readGroup(group.groupId)).events;
  const blocked = new Set(before.slice(0, 10).map(event => event.id));
  const { key } = await getGroupCrypto(group); const entries: RelayEntry[] = [];
  const attempts: string[] = [];
  const relay: Relay = { name: "fixture", async publish(_tag, author, blob) {
    const envelope = await decryptEnvelope(key, blob);
    if (envelope.type !== "events" || envelope.events.length !== 1) return { ok: false, reason: "fixture batch rejection" };
    const id = envelope.events[0]!.id; attempts.push(id);
    if (blocked.has(id)) return { ok: false, reason: "fixture permanent rejection" };
    entries.push({ blob, author, cursor: String(entries.length + 1) }); return { ok: true };
  }, async fetch() { return [...entries]; } };
  for (let cycle = 0; cycle < 7; cycle++) {
    const prior = attempts.length;
    await syncOnce(group.groupId, [relay], { messageLimitBytes: null });
    expect(attempts.length - prior).toBeLessThanOrEqual(10);
  }
  expect(new Set(attempts).size).toBe(61);
  expect(await syncCounts(group.groupId)).toEqual({ local: 10, published: 0, confirmed: 51 });
  expect((await readGroup(group.groupId)).events).toEqual(before);
}, 20_000);

it("does not mark a snapshot published without any relay acknowledgement", async () => {
  await resetRepositoryForTests(`snapshot-zero-relays-${crypto.randomUUID()}`);
  const group = await createGroup("Synthetic Snapshot", "SGD");
  const extra = Array.from({ length: 99 }, (_, index) => defaultParticipant({ deviceId: group.deviceId, nextCounter: group.nextCounter + index }, `Fixture ${index}`));
  await appendEvents(group.groupId, extra);
  const before = (await readGroup(group.groupId)).events;
  await markEvents(group.groupId, before.map(event => event.id), "confirmed");
  const result = await syncOnce(group.groupId, [], { messageLimitBytes: null });
  expect(result.snapshotsPublished).toBe(0);
  const after = await readGroup(group.groupId);
  expect(after.meta.lastSnapshotSeq).toBeUndefined();
  expect(after.events).toEqual(before);
}, 15_000);

it("clears the cycle timer after success before its time limit expires", async () => {
  await resetRepositoryForTests(`successful-cycle-cleanup-${crypto.randomUUID()}`);
  const group = await createGroup("Synthetic Timer Cleanup", "SGD");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const entries: RelayEntry[] = [];
  const relay: Relay = { name: "fixture", async publish(_tag, author, blob) {
    entries.push({ author, blob, cursor: "fixture-1" }); return { ok: true };
  }, async fetch() { return entries; } };
  const result = await syncOnce(group.groupId, [relay], { messageLimitBytes: null, networkBudgetMs: 100 });
  expect(result.confirmed).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
  expect((await readGroup(group.groupId)).events).toEqual(group.events);
});
