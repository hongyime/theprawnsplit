import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptEvents } from "@/crypto/envelope";
import { groupKey, secretFromBase64 } from "@/crypto/group";
import * as repository from "@/db/repo";
import { defaultParticipant, makeEvent } from "@/lib/events";
import { HttpRelay } from "@/relay/http";
import { syncOnce } from "@/relay/sync";
import type { Event } from "@theprawnsplit/core";

const store = vi.hoisted(() => ({ xrange: vi.fn(), xadd: vi.fn(), get: vi.fn(), setnx: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => store } }));
import handler from "../api/relay";

type Row = { cursor: string; author: string; blob: string };
let rows: Row[];
let requests: URL[];

beforeEach(() => {
  rows = [];
  requests = [];
  vi.clearAllMocks();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.fixture.invalid");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "synthetic-test-only");
  vi.stubGlobal("window", { location: { origin: "https://split.fixture.invalid" } });
  store.xrange.mockImplementation(async (_key: string, start: string, _end: string, limit: number) => {
    const sequence = start.startsWith("(") ? Number(start.slice(1).split("-")[1]) : 0;
    return Object.fromEntries(rows.filter((row) => Number(row.cursor.split("-")[1]) > sequence)
      .slice(0, limit).map(({ cursor, author, blob }) => [cursor, { author, blob }]));
  });
  store.xadd.mockRejectedValue(new Error("Unexpected fixture publication"));
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input, "https://split.fixture.invalid");
    expect(url.origin).toBe("https://split.fixture.invalid");
    expect(init?.method ?? "GET").toBe("GET");
    requests.push(url);
    return handler(new Request(url, init));
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function seed(label: string) {
  await repository.resetRepositoryForTests("operated-recovery-" + label);
  const group = await repository.ensureGroup();
  await repository.markEvents(group.groupId, group.events.map((event) => event.id), "confirmed");
  const key = await groupKey(secretFromBase64(group.secretB64));
  return { group, key, relay: new HttpRelay() };
}

async function addRow(key: CryptoKey, author: string, events: Event[]) {
  rows.push({ cursor: `1000-${rows.length + 1}`, author, blob: await encryptEvents(key, events) });
}

describe("operated relay recovery through the real HTTP adapter and API", () => {
  it("discovers a previously unknown device in an already populated ledger", async () => {
    const { group, key, relay } = await seed("new-device");
    const remote = defaultParticipant({ deviceId: "new-device", nextCounter: 1 }, "New Member");
    await addRow(key, remote.dev, [remote]);
    await syncOnce(group.groupId, [relay]);
    expect((await repository.readGroup(group.groupId)).events.map((event) => event.id)).toContain(remote.id);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.searchParams.has("author")).toBe(false);
  });

  it("reaches new authors beyond a full mixed stream page without refetching the first page", { timeout: 30_000 }, async () => {
    const { group, key, relay } = await seed("pages");
    const initialEvent = group.events[0];
    if (!initialEvent) throw new Error("Seed must create a group event");
    const blob = await encryptEvents(key, [initialEvent]);
    rows = Array.from({ length: 500 }, (_, index) => ({ cursor: `1000-${index + 1}`, author: group.deviceId, blob }));
    const remote = defaultParticipant({ deviceId: "later-device", nextCounter: 1 }, "Later Member");
    await addRow(key, remote.dev, [remote]);
    await syncOnce(group.groupId, [relay]);
    expect((await repository.readGroup(group.groupId)).events.map((event) => event.id)).not.toContain(remote.id);
    await syncOnce(group.groupId, [relay]);
    const received = await repository.readGroup(group.groupId);
    expect(received.events.filter((event) => event.id === remote.id)).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.searchParams.get("cursor")).toBe("1000-500");
    expect(received.events.filter((event) => event.id === initialEvent.id)).toHaveLength(1);
  });

  it("keeps read cursors unchanged when durable event storage fails", async () => {
    const { group, key, relay } = await seed("failed-storage");
    const remote = makeEvent({ deviceId: group.deviceId, nextCounter: group.nextCounter }, "ParticipantAdded", { pid: "pending", name: "Pending" });
    await addRow(key, remote.dev, [remote]);
    vi.spyOn(repository, "upsertRemoteEvents").mockRejectedValueOnce(new DOMException("Fixture storage full", "QuotaExceededError"));
    await expect(syncOnce(group.groupId, [relay])).rejects.toThrow("Fixture storage full");
    const after = await repository.readGroup(group.groupId);
    expect(after.meta.cursors).toEqual(group.meta.cursors);
    expect(after.events.map((event) => event.id)).not.toContain(remote.id);
  });

  it("recovers the missing event on retry after a temporary storage failure", async () => {
    const { group, key, relay } = await seed("retry-storage");
    const remote = makeEvent({ deviceId: group.deviceId, nextCounter: group.nextCounter }, "ParticipantAdded", { pid: "recover", name: "Recovered" });
    await addRow(key, remote.dev, [remote]);
    vi.spyOn(repository, "upsertRemoteEvents").mockRejectedValueOnce(new DOMException("Fixture storage full", "QuotaExceededError"));
    await expect(syncOnce(group.groupId, [relay])).rejects.toThrow("Fixture storage full");
    await syncOnce(group.groupId, [relay]);
    const after = await repository.readGroup(group.groupId);
    expect(after.events.filter((event) => event.id === remote.id)).toHaveLength(1);
    await syncOnce(group.groupId, [relay]);
    expect((await repository.readGroup(group.groupId)).events.filter((event) => event.id === remote.id)).toHaveLength(1);
  });

  it("uses one incremental stream read regardless of the known device count", async () => {
    const { group, relay } = await seed("read-count");
    const participants = ["one", "two", "three"].map((deviceId) => defaultParticipant({ deviceId, nextCounter: 1 }, deviceId));
    await repository.appendEvents(group.groupId, participants);
    await repository.markEvents(group.groupId, participants.map((event) => event.id), "confirmed");
    await syncOnce(group.groupId, [relay]);
    expect(requests).toHaveLength(1);
  });

  it("keeps event rows and the cursor together when an IndexedDB transaction aborts", async () => {
    const { group, key, relay } = await seed("aborted-transaction");
    const remote = defaultParticipant({ deviceId: "aborted-device", nextCounter: 1 }, "After Abort");
    await addRow(key, remote.dev, [remote]);
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = originalPut.call(this, value, key);
      if (this.name === "events" && value.eventId === remote.id) this.transaction.abort();
      return request;
    });
    await expect(syncOnce(group.groupId, [relay])).rejects.toMatchObject({ name: "AbortError" });
    put.mockRestore();
    const failed = await repository.readGroup(group.groupId);
    expect(failed.meta.cursors).toEqual(group.meta.cursors);
    expect(failed.events.map((event) => event.id)).not.toContain(remote.id);
    await syncOnce(group.groupId, [relay]);
    const recovered = await repository.readGroup(group.groupId);
    expect(recovered.events.filter((event) => event.id === remote.id)).toHaveLength(1);
    expect(recovered.meta.cursors["operated:topic"]).toBe("1000-1");
  });

  it("does not count replayed stored events against the admission budget for fresh events", { timeout: 30_000 }, async () => {
    const { group, key, relay } = await seed("replayed-budget");
    const existing = Array.from({ length: 600 }, (_, index) => defaultParticipant({
      deviceId: group.deviceId, nextCounter: group.nextCounter + index,
    }, `Member ${index}`));
    await repository.upsertRemoteEvents(group.groupId, existing);
    await repository.updateMeta(group.groupId, (meta) => ({ ...meta, lastSnapshotSeq: 600 }));
    const fresh = defaultParticipant({ deviceId: group.deviceId, nextCounter: group.nextCounter + existing.length }, "Fresh Member");
    for (let offset = 0; offset < 400; offset += 50) {
      await addRow(key, group.deviceId, existing.slice(offset, offset + 50));
    }
    await addRow(key, group.deviceId, [fresh]);
    const result = await syncOnce(group.groupId, [relay]);
    expect(result).toMatchObject({ received: 1, dropped: 0 });
    expect((await repository.readGroup(group.groupId)).events.filter((event) => event.id === fresh.id)).toHaveLength(1);
  });

  it("preserves old author checkpoints while replaying earlier events from a newly discovered device", async () => {
    const { group, key, relay } = await seed("legacy-cursors");
    const authorCursor = `operated:author:${group.deviceId}`;
    await repository.updateMeta(group.groupId, (meta) => ({ ...meta, cursors: { [authorCursor]: "1000-999" } }));
    const remote = defaultParticipant({ deviceId: "earlier-device", nextCounter: 1 }, "Earlier Member");
    await addRow(key, remote.dev, [remote]);
    await syncOnce(group.groupId, [relay]);
    const after = await repository.readGroup(group.groupId);
    expect(after.events.map((event) => event.id)).toContain(remote.id);
    expect(requests[0]?.searchParams.has("cursor")).toBe(false);
    expect(after.meta.cursors[authorCursor]).toBe("1000-999");
    expect(after.meta.cursors["operated:topic"]).toBe("1000-1");
  });
});
