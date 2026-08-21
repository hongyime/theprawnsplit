import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Event } from "@theprawnsplit/core";
import { bigintReplacer, bigintReviver } from "@/lib/money";
import { inferCurrency, newId } from "@/lib/ids";
import { createGroupSecret, groupKey, groupTag, secretFromBase64, secretToBase64 } from "@/crypto/group";
import { mintClaimKey, type ClaimAlg } from "@/crypto/claim";
import { emptyDurabilityPromptState, normalizeDurabilityPromptState, type DurabilityPromptState } from "@/lib/durability";
import type { RelaySettings } from "@/lib/relay-settings";
import type { SubgroupPreset } from "@/lib/subgroups";

export interface StoredGroup {
  groupId: string;
  name: string;
  currency: string;
  deviceId: string;
  nextCounter: number;
  createdAt: number;
  secretB64: string;
  tagHex: string;
}

export interface StoredEvent {
  groupId: string;
  eventId: string;
  eventJson: string;
  syncState: "local" | "published" | "confirmed";
  publishedAt?: number;
}

export interface StoredIdentity {
  groupId: string;
  pid: string;
  deviceId: string;
  alg: ClaimAlg;
  claimPk: string;
  claimPkJwk: JsonWebKey;
  claimSkJwk: JsonWebKey;
}

export interface StoredMeta {
  groupId: string;
  versionVector: Record<string, number>;
  discardVector: Record<string, number>;
  cursors: Record<string, string | null>;
  nostrSk: string;
  durability?: DurabilityPromptState;
  lastSnapshotSeq?: number;
  lastSyncAt?: number;
  lastSyncError?: string;
  unsyncedSince?: number;
  relaySettings?: RelaySettings;
  subgroups?: SubgroupPreset[];
}

interface StoredBuffer {
  groupId: string;
  eventId: string;
  eventJson: string;
  retryAt: number;
}

interface PrawnDb extends DBSchema {
  groups: { key: string; value: StoredGroup };
  events: {
    key: [string, string];
    value: StoredEvent;
    indexes: { byGroup: string; bySync: [string, string] };
  };
  identity: {
    key: [string, string];
    value: StoredIdentity;
    indexes: { byGroup: string };
  };
  meta: { key: string; value: StoredMeta };
  buffer: {
    key: [string, string];
    value: StoredBuffer;
    indexes: { byGroup: string };
  };
}

let dbName = "ThePrawnSplit";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<PrawnDb>> | undefined;

function db(): Promise<IDBPDatabase<PrawnDb>> {
  dbPromise ??= openDB<PrawnDb>(dbName, DB_VERSION, {
    upgrade(database, oldVersion, _newVersion, tx) {
      if (!database.objectStoreNames.contains("groups")) {
        database.createObjectStore("groups", { keyPath: "groupId" });
      }
      if (!database.objectStoreNames.contains("events")) {
        const events = database.createObjectStore("events", { keyPath: ["groupId", "eventId"] });
        events.createIndex("byGroup", "groupId");
        events.createIndex("bySync", ["groupId", "syncState"]);
      } else if (oldVersion < 2) {
        const events = tx.objectStore("events");
        if (!events.indexNames.contains("bySync")) events.createIndex("bySync", ["groupId", "syncState"]);
      }
      if (!database.objectStoreNames.contains("identity")) {
        const identity = database.createObjectStore("identity", { keyPath: ["groupId", "pid"] });
        identity.createIndex("byGroup", "groupId");
      }
      if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta", { keyPath: "groupId" });
      if (!database.objectStoreNames.contains("buffer")) {
        const buffer = database.createObjectStore("buffer", { keyPath: ["groupId", "eventId"] });
        buffer.createIndex("byGroup", "groupId");
      }
    },
  });
  return dbPromise;
}

export async function resetRepositoryForTests(nextDbName: string): Promise<void> {
  const existing = dbPromise ? await dbPromise : undefined;
  existing?.close();
  dbPromise = undefined;
  dbName = nextDbName;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(nextDbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete test database"));
    request.onblocked = () => reject(new Error("Test database deletion blocked"));
  });
}

export interface GroupRecord extends StoredGroup {
  events: Event[];
  meta: StoredMeta;
  identities: StoredIdentity[];
}

export interface TripLedgerExport {
  type: "TripLedgerExport";
  version: 1;
  group: Omit<StoredGroup, "deviceId" | "nextCounter" | "secretB64">;
  events: Event[];
  exportedAt: number;
}

export interface DeviceIdentityBackup {
  type: "DeviceIdentityBackup";
  version: 1;
  groupId: string;
  tagHex: string;
  identities: StoredIdentity[];
  exportedAt: number;
}

export interface TripLedgerDelta {
  type: "TripLedgerDelta";
  version: 1;
  group: Pick<StoredGroup, "groupId" | "name" | "currency" | "createdAt" | "tagHex">;
  events: Event[];
  exportedAt: number;
}

export interface JoinSeed {
  secretB64: string;
  tagHex: string;
  name?: string;
  currency?: string;
}

export interface SyncCounts {
  local: number;
  published: number;
  confirmed: number;
}

export const encodeEvent = (event: Event): string => JSON.stringify(event, bigintReplacer);
export const decodeEvent = (eventJson: string): Event => JSON.parse(eventJson, bigintReviver) as Event;

function counterFromEvents(events: Event[]): number {
  return events.reduce((max, event) => {
    const counter = event.id.startsWith(`${event.dev}:`) ? Number(event.id.split(":")[1]) : event.hlc.ctr;
    return Number.isFinite(counter) ? Math.max(max, counter) : max;
  }, 0);
}

function vectorFromEvents(events: Event[]): Record<string, number> {
  const vector: Record<string, number> = {};
  for (const event of events) {
    const counter = event.id.startsWith(`${event.dev}:`) ? Number(event.id.split(":")[1]) : event.hlc.ctr;
    vector[event.dev] = Math.max(vector[event.dev] ?? 0, Number.isFinite(counter) ? counter : event.hlc.ctr);
  }
  return vector;
}

function withVersionVector(event: Event, current: Record<string, number>): Event {
  const nextVector = { ...current, [event.dev]: Math.max(current[event.dev] ?? 0, counterFromEvents([event])) };
  return { ...event, vv: nextVector } as Event;
}

async function ensureSecrets(group: Partial<StoredGroup> & Omit<StoredGroup, "secretB64" | "tagHex">): Promise<StoredGroup> {
  if ("secretB64" in group && group.secretB64 && "tagHex" in group && group.tagHex) return group as StoredGroup;
  const secret = createGroupSecret();
  const patched = { ...group, secretB64: secretToBase64(secret), tagHex: await groupTag(secret) } as StoredGroup;
  await saveGroup(patched);
  return patched;
}

async function ensureMeta(group: StoredGroup, events: Event[]): Promise<StoredMeta> {
  const database = await db();
  const existing = await database.get("meta", group.groupId);
  if (existing) {
    const normalized = { ...existing, durability: normalizeDurabilityPromptState(existing.durability) };
    if (!existing.durability) await database.put("meta", normalized);
    return normalized;
  }
  const meta: StoredMeta = {
    groupId: group.groupId,
    versionVector: vectorFromEvents(events),
    discardVector: {},
    cursors: {},
    nostrSk: crypto.randomUUID().replaceAll("-", ""),
  };
  await database.put("meta", meta);
  return meta;
}

export async function updateMeta(groupId: string, update: (meta: StoredMeta) => StoredMeta): Promise<StoredMeta> {
  const database = await db();
  const existing = await database.get("meta", groupId);
  if (!existing) throw new Error("Group metadata not found");
  const next = update({ ...existing, durability: normalizeDurabilityPromptState(existing.durability) });
  await database.put("meta", next);
  return next;
}

export async function recordAppLaunch(groupId: string, now = Date.now()): Promise<StoredMeta> {
  return updateMeta(groupId, (meta) => ({
    ...meta,
    durability: {
      ...meta.durability!,
      sessionCount: meta.durability!.sessionCount + 1,
      lastSeenAt: now,
    },
  }));
}

export async function ensureGroup(seed?: JoinSeed): Promise<GroupRecord> {
  const database = await db();
  const groups = await database.getAll("groups");
  if (groups[0]) return readGroup(groups[0].groupId);

  const deviceId = newId("d");
  const secret = seed ? secretFromBase64(seed.secretB64) : createGroupSecret();
  const group: StoredGroup = {
    groupId: newId("g"),
    name: seed?.name?.trim() || "Trip",
    currency: (seed?.currency?.trim() || inferCurrency()).toUpperCase().slice(0, 3),
    deviceId,
    nextCounter: seed ? 1 : 2,
    createdAt: Date.now(),
    secretB64: secretToBase64(secret),
    tagHex: seed?.tagHex || (await groupTag(secret)),
  };
  const meta: StoredMeta = {
    groupId: group.groupId,
    versionVector: {},
    discardVector: {},
    cursors: {},
    nostrSk: crypto.randomUUID().replaceAll("-", ""),
    durability: emptyDurabilityPromptState(),
  };
  const tx = database.transaction(["groups", "events", "meta"], "readwrite");
  await tx.objectStore("groups").put(group);
  const created: Event[] = seed
    ? []
    : [
        {
          v: 1,
          id: `${deviceId}:1`,
          hlc: { wall: group.createdAt, ctr: 1, dev: deviceId },
          dev: deviceId,
          t: "GroupCreated",
          name: group.name,
          currency: group.currency,
        },
      ];
  for (const event of created) {
    meta.versionVector[event.dev] = Math.max(meta.versionVector[event.dev] ?? 0, counterFromEvents([event]));
    await tx.objectStore("events").put({ groupId: group.groupId, eventId: event.id, eventJson: encodeEvent(event), syncState: "local" });
  }
  await tx.objectStore("meta").put(meta);
  await tx.done;
  return { ...group, events: created, meta, identities: [] };
}

export async function readGroup(groupId: string): Promise<GroupRecord> {
  const database = await db();
  const storedGroup = await database.get("groups", groupId);
  if (!storedGroup) throw new Error("Group not found");
  const storedEvents = await database.getAllFromIndex("events", "byGroup", groupId);
  const events = storedEvents.map((row) => decodeEvent(row.eventJson));
  const group = await ensureSecrets(storedGroup);
  const meta = await ensureMeta(group, events);
  const identities = await database.getAllFromIndex("identity", "byGroup", groupId);
  return { ...group, nextCounter: Math.max(group.nextCounter, counterFromEvents(events) + 1), events, meta, identities };
}

export async function saveGroup(group: StoredGroup): Promise<void> {
  const database = await db();
  await database.put("groups", group);
}

export async function appendEvents(groupId: string, events: Event[]): Promise<GroupRecord> {
  const database = await db();
  const tx = database.transaction(["groups", "events", "meta"], "readwrite");
  const group = await tx.objectStore("groups").get(groupId);
  if (!group) throw new Error("Group not found");
  const meta =
    (await tx.objectStore("meta").get(groupId)) ??
    ({ groupId, versionVector: {}, discardVector: {}, cursors: {}, nostrSk: crypto.randomUUID().replaceAll("-", "") } satisfies StoredMeta);
  for (const event of events) {
    const stamped = withVersionVector(event, meta.versionVector);
    await tx.objectStore("events").put({ groupId, eventId: stamped.id, eventJson: encodeEvent(stamped), syncState: "local" });
    meta.versionVector[stamped.dev] = Math.max(meta.versionVector[stamped.dev] ?? 0, counterFromEvents([stamped]));
    meta.unsyncedSince ??= Date.now();
  }
  await tx.objectStore("meta").put(meta);
  await tx.done;
  return readGroup(groupId);
}

export async function replaceFromExport(exported: TripLedgerExport): Promise<GroupRecord> {
  if (exported.type !== "TripLedgerExport" || exported.version !== 1) throw new Error("Unsupported export");
  const database = await db();
  const secret = createGroupSecret();
  const group: StoredGroup = {
    ...exported.group,
    secretB64: secretToBase64(secret),
    tagHex: exported.group.tagHex || (await groupTag(secret)),
    deviceId: newId("d"),
    nextCounter: exported.events.length + 1,
  };
  const tx = database.transaction(["groups", "events", "meta"], "readwrite");
  await tx.objectStore("groups").put(group);
  const index = tx.objectStore("events").index("byGroup");
  for (const cursor of await index.getAllKeys(group.groupId)) {
    await tx.objectStore("events").delete(cursor as [string, string]);
  }
  for (const event of exported.events) {
    await tx.objectStore("events").put({ groupId: group.groupId, eventId: event.id, eventJson: encodeEvent(event), syncState: "local" });
  }
  await tx.objectStore("meta").put({
    groupId: group.groupId,
    versionVector: vectorFromEvents(exported.events),
    discardVector: {},
    cursors: {},
    nostrSk: crypto.randomUUID().replaceAll("-", ""),
    durability: emptyDurabilityPromptState(),
  });
  await tx.done;
  return readGroup(group.groupId);
}

export function createExport(group: GroupRecord): TripLedgerExport {
  return {
    type: "TripLedgerExport",
    version: 1,
    group: {
      groupId: group.groupId,
      name: group.name,
      currency: group.currency,
      createdAt: group.createdAt,
      tagHex: group.tagHex,
    },
    events: group.events,
    exportedAt: Date.now(),
  };
}

export function createIdentityBackup(group: GroupRecord): DeviceIdentityBackup {
  return {
    type: "DeviceIdentityBackup",
    version: 1,
    groupId: group.groupId,
    tagHex: group.tagHex,
    identities: group.identities,
    exportedAt: Date.now(),
  };
}

export function createDelta(group: GroupRecord, events: Event[]): TripLedgerDelta {
  return {
    type: "TripLedgerDelta",
    version: 1,
    group: {
      groupId: group.groupId,
      name: group.name,
      currency: group.currency,
      createdAt: group.createdAt,
      tagHex: group.tagHex,
    },
    events,
    exportedAt: Date.now(),
  };
}

export function createJoinSeed(group: GroupRecord): JoinSeed {
  return {
    secretB64: group.secretB64,
    tagHex: group.tagHex,
    name: group.name,
    currency: group.currency,
  };
}

export function stringifyExport(exported: TripLedgerExport | DeviceIdentityBackup | TripLedgerDelta): string {
  return JSON.stringify(exported, bigintReplacer, 2);
}

export type ImportArtifact = TripLedgerExport | DeviceIdentityBackup | TripLedgerDelta;

export function parseExport(text: string): ImportArtifact {
  return JSON.parse(text, bigintReviver) as ImportArtifact;
}

export async function restoreIdentityBackup(backup: DeviceIdentityBackup): Promise<GroupRecord> {
  if (backup.type !== "DeviceIdentityBackup" || backup.version !== 1) throw new Error("Unsupported identity backup");
  const database = await db();
  const groups = await database.getAll("groups");
  const group = groups.find((candidate) => candidate.tagHex === backup.tagHex || candidate.groupId === backup.groupId);
  if (!group) throw new Error("Import the matching TripLedgerExport or open the join link before restoring identity");
  if (group.tagHex !== backup.tagHex) throw new Error("Identity backup does not match this trip");

  const tx = database.transaction(["identity"], "readwrite");
  for (const identity of backup.identities) {
    await tx.objectStore("identity").put({ ...identity, groupId: group.groupId });
  }
  await tx.done;
  return readGroup(group.groupId);
}

export async function applyDelta(delta: TripLedgerDelta): Promise<GroupRecord> {
  if (delta.type !== "TripLedgerDelta" || delta.version !== 1) throw new Error("Unsupported delta");
  const database = await db();
  const groups = await database.getAll("groups");
  const group = groups.find((candidate) => candidate.tagHex === delta.group.tagHex || candidate.groupId === delta.group.groupId);
  if (!group) throw new Error("Open the matching join link or import the full TripLedgerExport before applying a delta");
  if (group.tagHex !== delta.group.tagHex) throw new Error("Delta does not match this trip");
  await upsertRemoteEvents(group.groupId, delta.events);
  return readGroup(group.groupId);
}

export async function markEvents(groupId: string, eventIds: string[], syncState: StoredEvent["syncState"]): Promise<void> {
  const database = await db();
  const tx = database.transaction(["events", "meta"], "readwrite");
  const now = Date.now();
  for (const eventId of eventIds) {
    const existing = await tx.objectStore("events").get([groupId, eventId]);
    if (existing) await tx.objectStore("events").put({ ...existing, syncState, publishedAt: now });
  }
  const meta = await tx.objectStore("meta").get(groupId);
  if (meta) {
    const nextMeta: StoredMeta = { ...meta, lastSyncAt: now };
    if (syncState === "confirmed") {
      const events = tx.objectStore("events");
      const [local, published] = await Promise.all([
        events.index("bySync").count([groupId, "local"]),
        events.index("bySync").count([groupId, "published"]),
      ]);
      if (local + published === 0) delete nextMeta.unsyncedSince;
    }
    await tx.objectStore("meta").put(nextMeta);
  }
  await tx.done;
}

export async function unsyncedEvents(groupId: string): Promise<Event[]> {
  const database = await db();
  const rows = await database.getAllFromIndex("events", "bySync", [groupId, "local"]);
  return rows.map((row) => decodeEvent(row.eventJson));
}

export async function pendingOutboundEvents(groupId: string): Promise<Event[]> {
  const database = await db();
  const local = await database.getAllFromIndex("events", "bySync", [groupId, "local"]);
  const published = await database.getAllFromIndex("events", "bySync", [groupId, "published"]);
  return [...local, ...published].map((row) => decodeEvent(row.eventJson));
}

export async function syncCounts(groupId: string): Promise<SyncCounts> {
  const database = await db();
  const rows = await database.getAllFromIndex("events", "byGroup", groupId);
  return rows.reduce<SyncCounts>(
    (counts, row) => {
      counts[row.syncState] += 1;
      return counts;
    },
    { local: 0, published: 0, confirmed: 0 },
  );
}

export async function dueBufferedEvents(groupId: string, now = Date.now()): Promise<Event[]> {
  const database = await db();
  const rows = await database.getAllFromIndex("buffer", "byGroup", groupId);
  return rows.filter((row) => row.retryAt <= now).map((row) => decodeEvent(row.eventJson));
}

export async function putBufferedEvents(groupId: string, events: { event: Event; retryAt: number }[]): Promise<void> {
  if (events.length === 0) return;
  const database = await db();
  const tx = database.transaction("buffer", "readwrite");
  for (const { event, retryAt } of events) {
    await tx.objectStore("buffer").put({ groupId, eventId: event.id, eventJson: encodeEvent(event), retryAt });
  }
  await tx.done;
}

export async function removeBufferedEvents(groupId: string, eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const database = await db();
  const tx = database.transaction("buffer", "readwrite");
  for (const eventId of eventIds) await tx.objectStore("buffer").delete([groupId, eventId]);
  await tx.done;
}

export async function updateTransportVectors(
  groupId: string,
  transportVector: Record<string, number>,
  discardVector: Record<string, number>,
): Promise<void> {
  const database = await db();
  const meta = await database.get("meta", groupId);
  if (!meta) return;
  const mergedVersion = { ...meta.versionVector };
  for (const [dev, counter] of Object.entries(transportVector)) {
    mergedVersion[dev] = Math.max(mergedVersion[dev] ?? 0, counter);
  }
  const mergedDiscard = { ...meta.discardVector };
  for (const [dev, counter] of Object.entries(discardVector)) {
    mergedDiscard[dev] = Math.max(mergedDiscard[dev] ?? 0, counter);
  }
  await database.put("meta", { ...meta, versionVector: mergedVersion, discardVector: mergedDiscard, lastSyncAt: Date.now() });
}

export async function upsertRemoteEvents(groupId: string, events: Event[]): Promise<number> {
  const database = await db();
  const tx = database.transaction(["events", "meta"], "readwrite");
  let added = 0;
  for (const event of events) {
    const key: [string, string] = [groupId, event.id];
    if (!(await tx.objectStore("events").get(key))) {
      await tx.objectStore("events").put({ groupId, eventId: event.id, eventJson: encodeEvent(event), syncState: "confirmed", publishedAt: Date.now() });
      added += 1;
    }
  }
  const meta = await tx.objectStore("meta").get(groupId);
  if (meta) {
    const mergedVector = { ...meta.versionVector };
    for (const [dev, counter] of Object.entries(vectorFromEvents(events))) {
      mergedVector[dev] = Math.max(mergedVector[dev] ?? 0, counter);
    }
    await tx.objectStore("meta").put({ ...meta, versionVector: mergedVector, lastSyncAt: Date.now() });
  }
  await tx.done;
  return added;
}

export async function saveMeta(meta: StoredMeta): Promise<void> {
  const database = await db();
  await database.put("meta", meta);
}

export async function markSnapshotPublished(groupId: string, seq: number): Promise<void> {
  const database = await db();
  const meta = await database.get("meta", groupId);
  if (!meta) return;
  await database.put("meta", { ...meta, lastSnapshotSeq: Math.max(meta.lastSnapshotSeq ?? 0, seq), lastSyncAt: Date.now() });
}

export async function ensureClaimIdentity(group: GroupRecord, pid: string): Promise<StoredIdentity> {
  const database = await db();
  const existing = await database.get("identity", [group.groupId, pid]);
  if (existing) return existing;
  const key = await mintClaimKey();
  const identity: StoredIdentity = {
    groupId: group.groupId,
    pid,
    deviceId: group.deviceId,
    alg: key.alg,
    claimPk: key.publicKey,
    claimPkJwk: key.publicJwk,
    claimSkJwk: key.privateJwk,
  };
  await database.put("identity", identity);
  return identity;
}

export async function getGroupCrypto(group: GroupRecord): Promise<{ secret: Uint8Array; key: CryptoKey }> {
  const secret = secretFromBase64(group.secretB64);
  return { secret, key: await groupKey(secret) };
}
