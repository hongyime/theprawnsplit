import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { parseEvent, type Event } from "@theprawnsplit/core";
import { bytesToHex } from "@/crypto/bytes";
import { bigintReplacer, bigintReviver } from "@/lib/money";
import { inferCurrency, newId } from "@/lib/ids";
import { createGroupSecret, groupKey, groupTag, secretFromBase64, secretToBase64 } from "@/crypto/group";
import { mintClaimKey, type ClaimAlg } from "@/crypto/claim";
import { emptyDurabilityPromptState, normalizeDurabilityPromptState, type DurabilityPromptState } from "@/lib/durability";
import { validateIdentityKeypair } from "@/lib/identity-backup-validation";
import { eventFingerprint } from "@/lib/event-fingerprint";
import type { RelaySettings } from "@/lib/relay-settings";
import type { SubgroupPreset } from "@/lib/subgroups";
import { config } from "@/config";

export interface StoredGroup {
  groupId: string;
  name: string;
  currency: string;
  deviceId: string;
  nextCounter: number;
  createdAt: number;
  secretB64: string;
  tagHex: string;
  // DATA-002: absent/undefined means linked (the normal, historical case --
  // created via createGroup/ensureGroup with a secret that genuinely
  // derives this tagHex). false means this group's secretB64/tagHex pair
  // is self-consistent but NOT verified against the original trip this
  // import came from -- it cannot decrypt or authenticate against that
  // trip's real relay history until a verified matching seed is attached.
  linked?: boolean;
  // The imported file's original tagHex, retained only while linked is
  // false, so a later attachVerifiedSeed() call can verify a supplied
  // seed actually corresponds to the SAME trip this group was imported
  // from, not some unrelated one.
  sourceTagHex?: string;
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
  syncFallbackNextId?: string;
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

const NOSTR_SECRET_RE = /^[0-9a-f]{64}$/;

function createNostrSecretHex(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

function normalizeNostrSecretHex(secret: string | undefined): string {
  return secret && NOSTR_SECRET_RE.test(secret) ? secret : createNostrSecretHex();
}

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

export function vectorFromEvents(events: Event[]): Record<string, number> {
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
    const normalized = {
      ...existing,
      durability: normalizeDurabilityPromptState(existing.durability),
      nostrSk: normalizeNostrSecretHex(existing.nostrSk),
    };
    if (!existing.durability || normalized.nostrSk !== existing.nostrSk) await database.put("meta", normalized);
    return normalized;
  }
  const meta: StoredMeta = {
    groupId: group.groupId,
    versionVector: vectorFromEvents(events),
    discardVector: {},
    cursors: {},
    nostrSk: createNostrSecretHex(),
  };
  await database.put("meta", meta);
  return meta;
}

export async function updateMeta(groupId: string, update: (meta: StoredMeta) => StoredMeta): Promise<StoredMeta> {
  const database = await db();
  const tx = database.transaction("meta", "readwrite");
  const existing = await tx.store.get(groupId);
  if (!existing) throw new Error("Group metadata not found");
  const next = update({ ...existing, durability: normalizeDurabilityPromptState(existing.durability) });
  await tx.store.put(next);
  await tx.done;
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

export async function listGroups(): Promise<StoredGroup[]> {
  const database = await db();
  const groups = await database.getAll("groups");
  return groups.sort((a, b) => b.createdAt - a.createdAt);
}

export async function createGroup(name?: string, currency?: string): Promise<GroupRecord> {
  const database = await db();
  const deviceId = newId("d");
  const secret = createGroupSecret();
  const group: StoredGroup = {
    groupId: newId("g"),
    name: name?.trim() || "Trip",
    currency: (currency?.trim() || inferCurrency()).toUpperCase().slice(0, 3),
    deviceId,
    nextCounter: 2,
    createdAt: Date.now(),
    secretB64: secretToBase64(secret),
    tagHex: await groupTag(secret),
  };
  const meta: StoredMeta = {
    groupId: group.groupId,
    versionVector: {},
    discardVector: {},
    cursors: {},
    nostrSk: createNostrSecretHex(),
    durability: emptyDurabilityPromptState(),
  };
  const tx = database.transaction(["groups", "events", "meta"], "readwrite");
  await tx.objectStore("groups").put(group);
  const created: Event[] = [
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

export async function ensureGroup(seed?: JoinSeed): Promise<GroupRecord> {
  if (seed !== undefined && (!seed || typeof seed !== "object" ||
      typeof seed.secretB64 !== "string" || typeof seed.tagHex !== "string" ||
      !/^[a-f0-9]{64}$/.test(seed.tagHex) ||
      (seed.name !== undefined && typeof seed.name !== "string") ||
      (seed.currency !== undefined && typeof seed.currency !== "string"))) {
    throw new Error("Join Link Is Malformed.");
  }
  const deviceId = newId("d");
  const secret = seed ? secretFromBase64(seed.secretB64) : createGroupSecret();
  if (secret.length !== 32) throw new Error("Join Secret Is Invalid.");
  // Finish cryptography before opening the IDB transaction: awaiting unrelated
  // work inside it can close the transaction before the lookup and write finish.
  const tagHex = await groupTag(secret);
  if (seed && seed.tagHex !== tagHex) throw new Error("Join Secret Does Not Match This Trip.");
  const group: StoredGroup = {
    groupId: newId("g"),
    name: seed?.name?.trim() || "Trip",
    currency: (seed?.currency?.trim() || inferCurrency()).toUpperCase().slice(0, 3),
    deviceId,
    nextCounter: seed ? 1 : 2,
    createdAt: Date.now(),
    secretB64: secretToBase64(secret),
    tagHex,
  };
  const meta: StoredMeta = {
    groupId: group.groupId,
    versionVector: {},
    discardVector: {},
    cursors: {},
    nostrSk: createNostrSecretHex(),
    durability: emptyDurabilityPromptState(),
  };
  const database = await db();
  // Serialize lookup and creation across tabs/concurrent joins. Do not merge or
  // delete any pre-existing ledgers, even if older versions created duplicates.
  const tx = database.transaction(["groups", "events", "meta"], "readwrite");
  const groups = await tx.objectStore("groups").getAll();
  const existing = seed ? groups.find((candidate) => candidate.tagHex === tagHex) : groups[0];
  if (existing) {
    await tx.done;
    if (seed && secretToBase64(secretFromBase64(existing.secretB64)) !== group.secretB64) {
      throw new Error("Stored Trip Secret Does Not Match The Join Link.");
    }
    return readGroup(existing.groupId);
  }
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
  // PERF-003: callers (Trip.svelte's renameGroup/setCurrency/commit) routinely
  // spread the full hydrated GroupRecord and pass it straight through. Only
  // ever persist the bare StoredGroup shape here, never duplicate the
  // authoritative events/meta/identity stores into this row.
  const persisted: StoredGroup = {
    groupId: group.groupId,
    name: group.name,
    currency: group.currency,
    deviceId: group.deviceId,
    nextCounter: group.nextCounter,
    createdAt: group.createdAt,
    secretB64: group.secretB64,
    tagHex: group.tagHex,
  };
  // DATA-002: linked/sourceTagHex are optional and must only be assigned
  // when actually present -- exactOptionalPropertyTypes forbids explicit
  // undefined, and omitting them here (rather than always spreading) is
  // exactly what would silently "relink" an unlinked group on its next
  // unrelated save (rename, currency change, commit).
  if (group.linked !== undefined) persisted.linked = group.linked;
  if (group.sourceTagHex !== undefined) persisted.sourceTagHex = group.sourceTagHex;
  await database.put("groups", persisted);
}

export async function appendEvents(groupId: string, events: Event[]): Promise<GroupRecord> {
  const database = await db();
  const tx = database.transaction(["groups", "events", "meta"], "readwrite");
  const group = await tx.objectStore("groups").get(groupId);
  if (!group) throw new Error("Group not found");
  const meta =
    (await tx.objectStore("meta").get(groupId)) ??
    ({ groupId, versionVector: {}, discardVector: {}, cursors: {}, nostrSk: createNostrSecretHex() } satisfies StoredMeta);
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
  const groups = await database.getAll("groups");
  const tagHex = exported.group.tagHex;
  const existingByTag = groups.find((candidate) => candidate.tagHex === tagHex);
  const collidingById = groups.find((candidate) => candidate.groupId === exported.group.groupId && candidate.tagHex !== tagHex);
  // DATA-001: a local groupId reused by an import file for a DIFFERENT
  // trip (a stale/corrupted/crafted export) must never be treated as an
  // update to that unrelated local trip. groupId is only a local primary
  // key; tagHex is a trip's real cryptographic identity.
  if (collidingById) throw new Error("Import artifact's group id collides with a different local trip's identity; refusing to overwrite it");

  if (existingByTag) {
    // DATA-001: the same trip already exists locally (matched by its real
    // identity, tagHex) — union the imported events into it rather than
    // deleting and replacing anything. Reuses this group's own secret,
    // deviceId, outbox and meta (cursors, version vector, durability
    // state) untouched; upsertRemoteEvents already provides transactional,
    // content-fingerprint-aware conflict detection (DATA-005) for exactly
    // this kind of union, so a genuinely conflicting same-id event still
    // rejects the whole import rather than silently picking a winner.
    await upsertRemoteEvents(existingByTag.groupId, exported.events);
    return readGroup(existingByTag.groupId);
  }

  // No local trip matches this tag at all: create an isolated new local
  // group. DATA-002: the export never carries a secret (by design), so
  // there is no way to verify this device actually holds the real trip's
  // key material. A fresh secret is generated for this NEW group's OWN
  // identity -- its tagHex is derived FROM that fresh secret, never reused
  // from the import file, so the stored tag/secret pair is always self-
  // consistent. The group is marked explicitly unlinked/offline; the
  // import file's original tag is retained as sourceTagHex so a later
  // attachVerifiedSeed() call can verify a supplied seed genuinely
  // corresponds to the SAME trip this import came from.
  const secret = createGroupSecret();
  const group: StoredGroup = {
    ...exported.group,
    secretB64: secretToBase64(secret),
    tagHex: await groupTag(secret),
    deviceId: newId("d"),
    nextCounter: exported.events.length + 1,
    linked: false,
    sourceTagHex: tagHex,
  };
  const tx = database.transaction(["groups", "events", "meta"], "readwrite");
  await tx.objectStore("groups").put(group);
  for (const event of exported.events) {
    await tx.objectStore("events").put({ groupId: group.groupId, eventId: event.id, eventJson: encodeEvent(event), syncState: "local" });
  }
  await tx.objectStore("meta").put({
    groupId: group.groupId,
    versionVector: vectorFromEvents(exported.events),
    discardVector: {},
    cursors: {},
    nostrSk: createNostrSecretHex(),
    durability: emptyDurabilityPromptState(),
  });
  await tx.done;
  return readGroup(group.groupId);
}

// DATA-002: upgrades an explicitly unlinked/offline group (created by
// replaceFromExport when no local trip matched the import's tag) to a
// fully linked one, once the caller supplies a seed that genuinely
// corresponds to the SAME trip this group was imported from. Never
// silently replaces an already-linked group's key material, and never
// trusts a seed's claimed tagHex without independently deriving it from
// the seed's own secret first.
export async function attachVerifiedSeed(groupId: string, seed: Pick<JoinSeed, "secretB64" | "tagHex">): Promise<GroupRecord> {
  const database = await db();
  const group = await database.get("groups", groupId);
  if (!group) throw new Error("Group not found");
  if (group.linked !== false) throw new Error("This trip already has verified key material; refusing to replace it");
  const secret = secretFromBase64(seed.secretB64);
  const derivedTag = await groupTag(secret);
  if (derivedTag !== seed.tagHex || derivedTag !== group.sourceTagHex) {
    throw new Error("Provided seed does not match the trip this import came from");
  }
  const linked: StoredGroup = { ...group, secretB64: seed.secretB64, tagHex: derivedTag, linked: true };
  delete linked.sourceTagHex;
  await saveGroup(linked);
  return readGroup(groupId);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
}

function assertNumber(value: unknown, message: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
}

function assertImportGroup(value: unknown): void {
  if (!isRecord(value)) throw new Error("Import artifact is missing group metadata");
  assertString(value.groupId, "Import artifact group is missing groupId");
  assertString(value.name, "Import artifact group is missing name");
  assertString(value.currency, "Import artifact group is missing currency");
  assertNumber(value.createdAt, "Import artifact group is missing createdAt");
  assertString(value.tagHex, "Import artifact group is missing tagHex");
}

function assertImportEvents(value: unknown): void {
  if (!Array.isArray(value)) throw new Error("Import artifact is missing events");
  // DATA-003: delegate to core's full per-variant parser instead of only
  // checking BaseEvent-shaped fields. A future-schema-version event is
  // accepted (it round-trips verbatim under quarantine at fold time); any
  // other parse failure — including a known variant with a malformed
  // type-specific field, or an HLC that passes typeof==='number' but is
  // NaN/Infinity/negative — rejects the whole import, matching this
  // function's existing all-or-nothing contract.
  for (const event of value) {
    const result = parseEvent(event, { supportedVersion: config.schemaVersion });
    if (result.kind === "invalid") throw new Error("Import artifact contains malformed events");
  }
}

function assertIdentityBackup(value: unknown): void {
  if (!isRecord(value)) throw new Error("Unsupported import artifact");
  assertString(value.groupId, "Identity backup is missing groupId");
  assertString(value.tagHex, "Identity backup is missing tagHex");
  if (!Array.isArray(value.identities)) throw new Error("Identity backup is missing identities");
  for (const identity of value.identities) {
    if (!isRecord(identity)) throw new Error("Identity backup contains malformed identities");
    assertString(identity.pid, "Identity backup contains malformed identities");
    assertString(identity.deviceId, "Identity backup contains malformed identities");
    assertString(identity.claimPk, "Identity backup contains malformed identities");
    if (identity.alg !== "ed25519" && identity.alg !== "ecdsa-p256") throw new Error("Identity backup contains malformed identities");
    if (!isRecord(identity.claimPkJwk) || !isRecord(identity.claimSkJwk)) throw new Error("Identity backup contains malformed identities");
  }
}

export function parseExport(text: string): ImportArtifact {
  const parsed = JSON.parse(text, bigintReviver) as Partial<ImportArtifact>;
  if (parsed.version !== 1) throw new Error("Unsupported import artifact");
  if (parsed.type === "TripLedgerExport" || parsed.type === "TripLedgerDelta") {
    assertImportGroup(parsed.group);
    assertImportEvents(parsed.events);
    assertNumber(parsed.exportedAt, "Import artifact is missing exportedAt");
    return parsed as TripLedgerExport | TripLedgerDelta;
  }
  if (parsed.type === "DeviceIdentityBackup") {
    assertIdentityBackup(parsed);
    assertNumber(parsed.exportedAt, "Identity backup is missing exportedAt");
    return parsed as DeviceIdentityBackup;
  }
  throw new Error("Unsupported import artifact");
}

export async function restoreIdentityBackup(backup: DeviceIdentityBackup): Promise<GroupRecord> {
  if (backup.type !== "DeviceIdentityBackup" || backup.version !== 1) throw new Error("Unsupported identity backup");
  const database = await db();
  const groups = await database.getAll("groups");
  const group = groups.find((candidate) => candidate.tagHex === backup.tagHex || candidate.groupId === backup.groupId);
  if (!group) throw new Error("Import the matching TripLedgerExport or open the join link before restoring identity");
  if (group.tagHex !== backup.tagHex) throw new Error("Identity backup does not match this trip");

  // DATA-003: prove every candidate keypair actually imports under its
  // declared algorithm and that claimSkJwk/claimPkJwk correspond to the
  // same real keypair (not merely record-shaped) BEFORE opening any IDB
  // transaction — crypto.subtle work is async, and awaiting it inside a
  // transaction can close the transaction before the write finishes (the
  // same hazard ensureGroup's own comment documents for group creation).
  for (const identity of backup.identities) {
    const result = await validateIdentityKeypair(identity);
    if (!result.ok) throw new Error(`Identity backup contains an invalid keypair (${result.reason})`);
  }

  const tx = database.transaction(["identity"], "readwrite");
  try {
    for (const identity of backup.identities) {
      // Recheck the target identity inside the write transaction: if this
      // pid's identity was concurrently replaced with different key
      // material after the async validation above started, do not
      // silently overwrite it with a backup validated against stale state.
      const existing = await tx.objectStore("identity").get([group.groupId, identity.pid]);
      if (existing && (existing.claimPk !== identity.claimPk || existing.alg !== identity.alg)) {
        throw new Error("Identity backup conflicts with identity material written after validation began");
      }
      await tx.objectStore("identity").put({ ...identity, groupId: group.groupId });
    }
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* The transaction may already be aborted. */ }
    await tx.done.catch(() => {});
    throw error;
  }
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
  return (await pendingOutboundEventRows(groupId)).map((row) => row.event);
}

export async function pendingOutboundEventRows(groupId: string): Promise<{ event: Event; syncState: StoredEvent["syncState"] }[]> {
  const database = await db();
  const local = await database.getAllFromIndex("events", "bySync", [groupId, "local"]);
  const published = await database.getAllFromIndex("events", "bySync", [groupId, "published"]);
  return [...local, ...published].map((row) => ({ event: decodeEvent(row.eventJson), syncState: row.syncState }));
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

export async function confirmedEvents(groupId: string): Promise<Event[]> {
  const database = await db();
  const rows = await database.getAllFromIndex("events", "bySync", [groupId, "confirmed"]);
  return rows.map((row) => decodeEvent(row.eventJson));
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

// DATA-005: thrown by upsertRemoteEvents when an incoming event shares an id
// with an already-stored event but has different content. Carries both
// sides so a caller can log/surface them for explicit reconciliation rather
// than the batch's cursor/checkpoint silently advancing past the conflict.
export class EventIdentityConflictError extends Error {
  constructor(
    public readonly groupId: string,
    public readonly eventId: string,
    public readonly existing: Event,
    public readonly incoming: Event,
  ) {
    super(`Event ${eventId} in group ${groupId} has conflicting content across replicas`);
    this.name = "EventIdentityConflictError";
  }
}

export async function upsertRemoteEvents(groupId: string, events: Event[], cursorUpdates: Record<string, string> = {}): Promise<number> {
  const database = await db();
  // DATA-005: resolve every conflict check (including the crypto-heavy
  // fingerprint hashes) BEFORE opening the write transaction at all --
  // NOT merely before issuing any write within an already-open one.
  // crypto.subtle.digest (via eventFingerprint) is a real async
  // operation; awaiting it while an IDB transaction is open can let the
  // transaction auto-deactivate under load (InvalidStateError on the next
  // objectStore() call), the same hazard ensureGroup's own comment
  // documents for crypto work generally. database.get() below uses its
  // own short-lived internal transaction per call, never held open across
  // the fingerprint awaits.
  const toInsert: Event[] = [];
  for (const event of events) {
    const existingRow = await database.get("events", [groupId, event.id]);
    if (!existingRow) {
      toInsert.push(event);
      continue;
    }
    const existingEvent = decodeEvent(existingRow.eventJson);
    const [existingFingerprint, incomingFingerprint] = await Promise.all([
      eventFingerprint(existingEvent),
      eventFingerprint(event),
    ]);
    if (existingFingerprint !== incomingFingerprint) {
      throw new EventIdentityConflictError(groupId, event.id, existingEvent, event);
    }
    // Identical content already stored under this id — a true repeat, not
    // a conflict. Idempotent no-op, matching this function's existing
    // "skip an id we already have" contract for the non-conflicting case.
  }

  const tx = database.transaction(["events", "meta"], "readwrite");
  let added = 0;
  try {
    for (const event of toInsert) {
      await tx.objectStore("events").put({ groupId, eventId: event.id, eventJson: encodeEvent(event), syncState: "confirmed", publishedAt: Date.now() });
      added += 1;
    }
    const meta = await tx.objectStore("meta").get(groupId);
    if (meta) {
      const mergedVector = { ...meta.versionVector };
      for (const [dev, counter] of Object.entries(vectorFromEvents(events))) {
        mergedVector[dev] = Math.max(mergedVector[dev] ?? 0, counter);
      }
      await tx.objectStore("meta").put({ ...meta, versionVector: mergedVector,
        cursors: { ...meta.cursors, ...cursorUpdates }, lastSyncAt: Date.now() });
    }
    await tx.done;
  } catch (error) {
    // Also roll back a synchronous serialization failure between requests.
    try { tx.abort(); } catch { /* The transaction may already be aborted. */ }
    await tx.done.catch(() => {});
    throw error;
  }
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
