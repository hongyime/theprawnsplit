import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as local from "@/db/repo";
import { decryptEnvelope, encryptEnvelope, encryptEvents } from "@/crypto/envelope";
import { relayWriteProof } from "@/crypto/group";
import { defaultParticipant } from "@/lib/events";
import { HttpRelay } from "@/relay/http";
import { NostrRelay } from "@/relay/nostr";
import { discoverMigration } from "@/relay/migration-mode";
import { syncMigrated } from "@/relay/migrated-sync";
import { eventFingerprint } from "@/lib/event-fingerprint";
import { RecoveryRepository } from "@/relay/recovery-db";
import { coordinatedSync, syncNetworkBudget } from "@/relay/sync-cycle";
import { syncOnce } from "@/relay/sync";
import { restoreNostrSource } from "@/relay/source-archive";
import handler from "../api/relay";

let sql: PGlite;
let repository: RecoveryRepository;
let group: local.GroupRecord;
let posted: string[];
let loseAck: boolean;
let dbName: string;
const operated = new HttpRelay();

beforeAll(async () => {
  sql = new PGlite();
  await sql.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await sql.exec(readFileSync(new URL("../supabase/schemas/relay.sql", import.meta.url), "utf8"));
}, 90_000);
afterAll(async () => { await sql.close(); });
beforeEach(async () => {
  await sql.exec(`truncate prawnsplit.relay_entries,prawnsplit.relay_topics,prawnsplit.relay_control;
    insert into prawnsplit.relay_control(singleton,writes_enabled,max_payload_bytes,max_entries,max_groups,max_namespace_bytes,max_database_bytes)
    values(true,true,10000000,10000,100,200000000,2000000000);`);
  dbName = `device-catchup-${crypto.randomUUID()}`;
  await local.resetRepositoryForTests(dbName);
  group = await local.createGroup("Synthetic Catchup", "SGD");
  repository = new RecoveryRepository(dbName + "-recovery");
  posted = []; loseAck = false;
  vi.stubGlobal("window", { location: { origin: "https://split.fixture.invalid" } });
  vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, callback: (lock: object) => unknown) => callback({}) } });
  vi.stubEnv("PRAWNSPLIT_RELAY_MIGRATION", "supabase-v1");
  vi.stubEnv("PRAWNSPLIT_RELAY_BACKEND", "supabase");
  vi.stubEnv("PRAWNSPLIT_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("PRAWNSPLIT_SUPABASE_SECRET_KEY", "sb_secret_synthetic_fixture");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input, "https://split.fixture.invalid");
    if (url.origin === "https://split.fixture.invalid") {
      const response = await handler(new Request(url, init));
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)).blob);
        if (loseAck) { loseAck = false; throw new TypeError("Synthetic lost response after commit"); }
      }
      return response;
    }
    expect(url.origin).toBe("https://synthetic.supabase.co");
    const body = JSON.parse(String(init?.body));
    if (url.pathname.endsWith("prawnsplit_relay_append")) {
      const rows = (await sql.query<{ cursor: string }>("select public.prawnsplit_relay_append($1,$2,$3,$4) as cursor",
        [body.p_tag, body.p_commitment, body.p_blob, body.p_author])).rows;
      return Response.json(rows[0]!.cursor);
    }
    expect(url.pathname).toBe("/rest/v1/rpc/prawnsplit_relay_read");
    return Response.json((await sql.query("select * from public.prawnsplit_relay_read($1,$2,$3,$4)",
      [body.p_tag, body.p_cursor, body.p_limit, body.p_author])).rows);
  }));
});
afterEach(async () => { await repository.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function cycle(nostr?: Parameters<typeof syncMigrated>[2]) {
  return coordinatedSync(group.groupId, async () => {
    const deadline = syncNetworkBudget();
    try {
      const { state } = await discoverMigration(group.groupId, operated, {}, repository);
      return await syncMigrated(group.groupId, operated, nostr, state!, deadline, repository);
    } finally { deadline.close(); }
  });
}
async function countRows() { return Number((await sql.query<{ count: string }>("select count(*)::text as count from prawnsplit.relay_entries")).rows[0]!.count); }
async function publishRaw(events: local.GroupRecord["events"]) {
  const { secret, key } = await local.getGroupCrypto(group);
  return operated.publish(group.tagHex, "old-device", await encryptEvents(key, events), await relayWriteProof(secret, group.tagHex));
}

async function snapshotSource(extra = "", content?: string) {
  const { key } = await local.getGroupCrypto(group);
  const blob = content ?? await encryptEnvelope(key, { type: "snapshot", seq: 0, vv: {}, state: {}, createdAt: 1 });
  const event = finalizeEvent({ kind: 1512, created_at: 1, tags: [["t", group.tagHex]], content: blob }, generateSecretKey());
  const raw = JSON.stringify(event).slice(0, -1) + ', "extra":' + JSON.stringify(extra) + '}';
  const url = "wss://snapshot.fixture.invalid";
  const entry = { cursor: "1", author: event.pubkey, blob, sourceEventJson: raw };
  return { raw, url, entry, source: { relayUrls: [url], recoveryPage: vi.fn().mockResolvedValue([entry]) } };
}
async function storedArchives() {
  const { key } = await local.getGroupCrypto(group);
  const rows = (await sql.query<{ blob: string }>("select blob from prawnsplit.relay_entries order by cursor_ms,cursor_seq")).rows;
  const envelopes = await Promise.all(rows.map((row) => decryptEnvelope(key, row.blob)));
  return envelopes.flatMap((envelope) => envelope.type === "events" && envelope.sourceArchive ? [envelope.sourceArchive] : []);
}
const currentState = async () => (await discoverMigration(group.groupId, operated, {}, repository)).state!;

describe("real IndexedDB → HTTP API → adapter → PostgreSQL recovery", () => {
  it("retains a signed snapshot byte for byte in encrypted SQL rows before advancing its source checkpoint", async () => {
    await cycle(); await cycle(); await cycle();
    const { key } = await local.getGroupCrypto(group);
    const blob = await encryptEnvelope(key, { type: "snapshot", seq: 0, vv: {}, state: {}, createdAt: 1 });
    const event = finalizeEvent({ kind: 1512, created_at: 1, tags: [["t", group.tagHex]], content: blob }, generateSecretKey());
    const raw = JSON.stringify(event).slice(0, -1) + ', "extra":9007199254740993}';
    const url = "wss://snapshot.fixture.invalid";
    const source = { relayUrls: [url], recoveryPage: vi.fn().mockResolvedValue([{ cursor: "1", author: event.pubkey, blob, sourceEventJson: raw }]) };
    expect((await cycle(source)).errors).toEqual([]);
    const rows = (await sql.query<{ blob: string }>("select blob from prawnsplit.relay_entries order by cursor_ms,cursor_seq")).rows;
    const envelopes = await Promise.all(rows.map((row) => decryptEnvelope(key, row.blob)));
    const archives = envelopes.flatMap((envelope) => envelope.type === "events" && "sourceArchive" in envelope ? [envelope.sourceArchive as { data: string }] : []);
    expect(archives).toHaveLength(1);
    expect(Buffer.from(archives[0]!.data, "base64").toString("utf8")).toBe(raw);
    const state = (await discoverMigration(group.groupId, operated, {}, repository)).state!;
    expect(state.nostr[url]?.lastSweep).toBeTypeOf("number");
  });

  it("does not send original history if its durable queue cannot be committed", async () => {
    await cycle(); await cycle(); await cycle(); posted = [];
    const { source, url } = await snapshotSource();
    const originalSave = repository.save.bind(repository);
    vi.spyOn(repository, "save").mockImplementation(async (state) => {
      if (state.sourcePending) throw new DOMException("Synthetic full device", "QuotaExceededError");
      await originalSave(state);
    });
    expect((await cycle(source)).errors.length).toBeGreaterThan(0);
    expect(posted).toEqual([]);
    expect((await currentState()).nostr[url]).toBeUndefined();
    expect((await currentState()).sourcePending).toBeUndefined();
  });

  it("reopens a multipart source queue after a lost ACK and advances only after every SQL receipt", async () => {
    await cycle(); await cycle(); await cycle(); posted = [];
    const { source, url, raw } = await snapshotSource("🦐".repeat(20_000));
    loseAck = true;
    expect((await cycle(source)).errors.join(" ")).toContain("Older history remains");
    const pending = (await currentState()).sourcePending!;
    expect(pending.packets.length).toBeGreaterThan(1);
    expect(pending.packets[0]!.blob).toBe(posted[0]);
    expect((await currentState()).nostr[url]).toBeUndefined();
    await repository.close(); repository = new RecoveryRepository(dbName + "-recovery");
    for (let index = 0; index < pending.packets.length; index += 1) {
      expect((await cycle(source)).errors).toEqual([]);
      if (index + 1 < pending.packets.length) expect((await currentState()).nostr[url]).toBeUndefined();
    }
    expect(posted[1]).toBe(posted[0]);
    expect(source.recoveryPage).toHaveBeenCalledTimes(1);
    expect((await currentState()).sourcePending).toBeUndefined();
    expect((await currentState()).nostr[url]?.lastSweep).toBeTypeOf("number");
    const archives = await storedArchives();
    expect(archives).toHaveLength(pending.packets.length);
    expect(await restoreNostrSource(archives, group.tagHex, 1512)).toBe(raw);
  });

  it("atomically retains its source queue and checkpoint when the final local receipt transaction aborts", async () => {
    await cycle(); await cycle(); await cycle(); posted = [];
    const { source, url } = await snapshotSource();
    const originalPut = IDBObjectStore.prototype.put;
    let abortOnce = true;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = originalPut.call(this, value, key);
      if (abortOnce && posted.length === 1 && this.name === "states" && !value.sourcePending) {
        abortOnce = false; this.transaction.abort();
      }
      return request;
    });
    expect((await cycle(source)).errors.length).toBeGreaterThan(0);
    put.mockRestore();
    const state = await currentState();
    expect(state.sourcePending?.packets[0]!.blob).toBe(posted[0]);
    expect(state.nostr[url]).toBeUndefined();
    expect(await repository.sourceCovered(state.scope, state.sourcePending!.packets[0]!.receipt)).toBe(false);
    expect((await cycle(source)).errors).toEqual([]);
    expect(posted[1]).toBe(posted[0]);
    expect(await storedArchives()).toHaveLength(1);
    expect((await currentState()).nostr[url]?.lastSweep).toBeTypeOf("number");
  });

  it("keeps source bytes pending when the SQL capacity guard refuses them and allows later local edits", async () => {
    await cycle(); await cycle(); await cycle(); posted = [];
    const { source, url, raw } = await snapshotSource("🦐".repeat(20_000));
    await sql.exec("update prawnsplit.relay_control set max_payload_bytes=payload_bytes");
    expect((await cycle(source)).errors.length).toBeGreaterThan(0);
    expect(await storedArchives()).toHaveLength(0);
    expect((await currentState()).nostr[url]).toBeUndefined();
    const retained = (await currentState()).sourcePending!.packets[0]!.blob;
    await sql.exec("update prawnsplit.relay_control set max_payload_bytes=10000000");
    const fresh = defaultParticipant({ deviceId: "fresh-device", nextCounter: 1 }, "Fresh Edit");
    await local.appendEvents(group.groupId, [fresh]);
    expect((await cycle(source)).errors).toEqual([]);
    expect(posted.at(-1)).toBe(retained);
    expect((await local.syncCounts(group.groupId)).local).toBe(0);
    while ((await currentState()).sourcePending) await cycle(source);
    expect(await restoreNostrSource(await storedArchives(), group.tagHex, 1512)).toBe(raw);
    expect(source.recoveryPage).toHaveBeenCalledTimes(1);
  });

  it("learns archived fragment receipts on a returning device before reading Nostr again", async () => {
    await cycle(); await cycle(); await cycle();
    const { source, raw, url } = await snapshotSource();
    await cycle(source);
    await repository.close(); repository = new RecoveryRepository(dbName + "-returning-source");
    source.recoveryPage.mockClear(); posted = [];
    await cycle(source);
    expect(source.recoveryPage).not.toHaveBeenCalled();
    await cycle(source);
    expect(source.recoveryPage).toHaveBeenCalledTimes(1);
    expect(posted).toEqual([]);
    expect(await restoreNostrSource(await storedArchives(), group.tagHex, 1512)).toBe(raw);
    expect((await currentState()).nostr[url]?.lastSweep).toBeTypeOf("number");
  });

  it("retains signed but unreadable original ciphertext without promoting its source checkpoint", async () => {
    await cycle(); await cycle(); await cycle(); posted = [];
    const { source, raw, url } = await snapshotSource("unknown format", "unreadable encrypted payload");
    expect((await cycle(source)).errors.join(" ")).toContain("Unreadable recovered history");
    expect(await restoreNostrSource(await storedArchives(), group.tagHex, 1512)).toBe(raw);
    expect((await currentState()).nostr[url]).toBeUndefined();
    await cycle(source);
    expect(posted).toHaveLength(1);
    expect((await currentState()).nostr[url]).toBeUndefined();
  });

  it("rejects incomplete source provenance without advancing or writing archival bytes", async () => {
    await cycle(); await cycle(); await cycle(); posted = [];
    const { source, entry, url } = await snapshotSource();
    source.recoveryPage.mockResolvedValue([{ ...entry, sourceEventJson: undefined }]);
    expect((await cycle(source)).errors.join(" ")).toContain("checkpoint is retained");
    expect(posted).toEqual([]);
    expect((await currentState()).nostr[url]).toBeUndefined();
  });
  it("pauses migrated syncing without cross-tab lock support and keeps local keys/history", async () => {
    vi.stubGlobal("navigator", {});
    const before = await local.readGroup(group.groupId);
    expect((await cycle()).errors[0]).toContain("cannot safely coordinate sync across tabs");
    expect(await countRows()).toBe(0);
    expect(posted).toEqual([]);
    const after = await local.readGroup(group.groupId);
    expect(after.events).toEqual(before.events);
    expect(after.secretB64).toBe(before.secretB64);
    expect(after.meta.nostrSk).toBe(before.meta.nostrSk);
  });
  it("copies previously confirmed device-only history and preserves all keys across a recovery database reopen", async () => {
    const identity = await local.ensureClaimIdentity(group, "fixture-person");
    const historic = defaultParticipant({ deviceId: "offline-device", nextCounter: 1 }, "Retained Offline Member");
    await local.appendEvents(group.groupId, [historic]);
    await local.markEvents(group.groupId, [...group.events.map((event) => event.id), historic.id], "confirmed");
    const before = await local.readGroup(group.groupId);
    await cycle();
    expect(await countRows()).toBe(1);
    await repository.close(); repository = new RecoveryRepository(dbName + "-recovery");
    await cycle(); await cycle();
    expect(posted).toHaveLength(1);
    const after = await local.readGroup(group.groupId);
    expect(after.events.map((event) => event.id).sort()).toEqual(before.events.map((event) => event.id).sort());
    expect(after.secretB64).toBe(before.secretB64);
    expect(after.meta.nostrSk).toBe(before.meta.nostrSk);
    expect(after.identities).toContainEqual(identity);
  });

  it("retries identical ciphertext after a lost ACK and browser reopen without allocating another row", async () => {
    loseAck = true;
    expect((await cycle()).errors.length).toBeGreaterThan(0);
    expect(await countRows()).toBe(1);
    await repository.close(); repository = new RecoveryRepository(dbName + "-recovery");
    const retry = await cycle();
    expect(retry.errors).toEqual([]);
    expect(posted).toHaveLength(2);
    expect(posted[1]).toBe(posted[0]);
    expect(await countRows()).toBe(1);
    expect(await local.syncCounts(group.groupId)).toEqual({ local: 0, published: 0, confirmed: 1 });
  });

  it("reconciles an unknown returning device later without resending already operated-covered events", async () => {
    await cycle(); await cycle();
    const event = defaultParticipant({ deviceId: "returning-device", nextCounter: 1 }, "Late Device");
    await local.upsertRemoteEvents(group.groupId, [event]);
    // A previously offline browser has its own recovery receipt database.
    await repository.close(); repository = new RecoveryRepository(dbName + "-returning");
    await cycle(); await cycle(); await cycle();
    expect(await countRows()).toBe(2);
    expect(posted).toHaveLength(2);
    expect((await local.readGroup(group.groupId)).events.filter((item) => item.id === event.id)).toHaveLength(1);
  });

  it("retains its exact retry packet when the local receipt transaction aborts after a server commit", async () => {
    const originalPut = IDBObjectStore.prototype.put;
    let abortOnce = true;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = originalPut.call(this, value, key);
      if (abortOnce && posted.length === 1 && this.name === "states" && !value.pending) {
        abortOnce = false; this.transaction.abort();
      }
      return request;
    });
    expect((await cycle()).errors.length).toBeGreaterThan(0);
    put.mockRestore();
    const state = (await discoverMigration(group.groupId, operated, {}, repository)).state!;
    expect(state.pending?.blob).toBe(posted[0]);
    expect(await countRows()).toBe(1);
    await cycle();
    expect(posted[1]).toBe(posted[0]);
    expect(await countRows()).toBe(1);
  });

  it("retains its checkpoint when a local event transaction fails, then recovers the same page", async () => {
    await local.markEvents(group.groupId, group.events.map((event) => event.id), "confirmed");
    const remote = defaultParticipant({ deviceId: "remote-device", nextCounter: 1 }, "Recover After Failure");
    await publishRaw([remote]); posted = [];
    vi.spyOn(local, "promoteLedger").mockRejectedValueOnce(new DOMException("Fixture full", "QuotaExceededError"));
    expect((await cycle()).errors.length).toBeGreaterThan(0);
    let state = (await discoverMigration(group.groupId, operated, {}, repository)).state!;
    expect(state.cursor).toBeUndefined();
    expect((await local.readGroup(group.groupId)).events.some((event) => event.id === remote.id)).toBe(false);
    await cycle();
    state = (await discoverMigration(group.groupId, operated, {}, repository)).state!;
    expect(state.cursor).toMatch(/^\d+-\d+$/);
    expect((await local.readGroup(group.groupId)).events.filter((event) => event.id === remote.id)).toHaveLength(1);
  });

  it("does not overwrite or claim coverage for a conflicting event with the same ID", async () => {
    const original = group.events[0]!;
    await publishRaw([{ ...original, v: 999 }]);
    const result = await cycle();
    expect(result.errors.join(" ")).toContain("Conflicting event identity");
    const state = (await discoverMigration(group.groupId, operated, {}, repository)).state!;
    expect(state.cursor).toBeUndefined();
    expect((await local.readGroup(group.groupId)).events[0]).toEqual(original);
    // Coverage can only result from the subsequent exact local upload, never
    // the mismatched remote payload; that upload remains independently visible.
    expect(await countRows()).toBe(2);
    expect(await repository.covered(state.scope, original.id, await eventFingerprint({ ...original, v: 999 }))).toBe(false);
  });

  it("recovers duplicated late Nostr events through the actual default sync branch without publishing to Nostr", async () => {
    const remote = defaultParticipant({ deviceId: "nostr-late-device", nextCounter: 1 }, "Nostr Late Arrival");
    const { key } = await local.getGroupCrypto(group);
    const blob = await encryptEvents(key, [remote, remote]);
    const signed = finalizeEvent({ kind: 1512, created_at: 1, tags: [["t", group.tagHex]], content: blob }, generateSecretKey());
    const entry = { cursor: "1", author: signed.pubkey, blob, sourceEventJson: JSON.stringify(signed) };
    const recovery = vi.spyOn(NostrRelay.prototype, "recoveryPage").mockResolvedValue([entry, entry]);
    const publish = vi.spyOn(NostrRelay.prototype, "publish").mockRejectedValue(new Error("Nostr publication must be unreachable"));
    const first = await syncOnce(group.groupId);
    expect(first.errors).toEqual([]);
    await syncOnce(group.groupId); await syncOnce(group.groupId);
    expect(publish).not.toHaveBeenCalled();
    expect((await local.readGroup(group.groupId)).events.filter((event) => event.id === remote.id)).toHaveLength(1);
    const archives = await storedArchives();
    expect(new Set(archives.map((item) => item.sourceUrl))).toEqual(new Set(recovery.mock.calls.map(([url]) => url)));
    expect(archives).toHaveLength(new Set(recovery.mock.calls.map(([url]) => url)).size);
    expect(await countRows()).toBe(1 + archives.length);
  });

  it("keeps custom settings and local history while blocking external writes after migration", async () => {
    const settings = { useOperated: false, operatedEndpoint: "/custom-relay", nostrRelays: ["wss://custom.fixture.invalid"] };
    await local.updateMeta(group.groupId, (meta) => ({ ...meta, relaySettings: settings }));
    const publish = vi.spyOn(NostrRelay.prototype, "publish");
    const result = await syncOnce(group.groupId);
    expect(result.errors[0]).toContain("Choose the default operated relay");
    expect(publish).not.toHaveBeenCalled();
    expect((await local.readGroup(group.groupId)).meta.relaySettings).toEqual(settings);
    expect(await local.syncCounts(group.groupId)).toMatchObject({ local: 1 });
    expect(await countRows()).toBe(0);
  });

  it("fails closed when discovery is unavailable and preserves local events for retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Synthetic offline")));
    const publish = vi.spyOn(NostrRelay.prototype, "publish");
    expect((await syncOnce(group.groupId)).errors.length).toBeGreaterThan(0);
    expect(publish).not.toHaveBeenCalled();
    expect((await local.readGroup(group.groupId)).events).toEqual(group.events);
  });
}, 20_000);
