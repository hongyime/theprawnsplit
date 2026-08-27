import type { Event } from "@theprawnsplit/core";
import { admitTransportEvents, canonicalState, fold } from "@theprawnsplit/core";
import { config } from "@/config";
import {
  dueBufferedEvents,
  getGroupCrypto,
  confirmedEvents,
  markSnapshotPublished,
  markEvents,
  pendingOutboundEventRows,
  putBufferedEvents,
  readGroup,
  removeBufferedEvents,
  saveMeta,
  updateTransportVectors,
  updateMeta,
  upsertRemoteEvents,
  vectorFromEvents,
  type GroupRecord,
} from "@/db/repo";
import { decryptEnvelope, encryptEnvelope, encryptEvents, type SnapshotEnvelope } from "@/crypto/envelope";
import { relayWriteProof } from "@/crypto/group";
import { normalizeRelaySettings } from "@/lib/relay-settings";
import { HttpRelay } from "./http";
import { NostrRelay } from "./nostr";
import { classifyRelayIssue, isDuplicateRelayAck } from "./diagnostics";
import { BATCH_SAFETY_MARGIN_BYTES, fitCountWithinLimit, projectBatchSize, resolveMessageLimit } from "./batch-limits";
import { fetchMaxMessageLength } from "./nip11";
import type { Relay, SyncResult } from "./types";

const FETCH_LIMIT = 500;

interface RelayFetchPlan {
  cursorKey: string;
  opts: { author?: string; cursor?: string | null; limit?: number };
}

function knownDeviceIds(group: GroupRecord): string[] {
  return [...new Set(group.events.map((event) => event.dev))].sort();
}

function fetchOpts(cursor: string | null | undefined, author?: string): RelayFetchPlan["opts"] {
  return {
    ...(author ? { author } : {}),
    ...(cursor ? { cursor } : {}),
    limit: FETCH_LIMIT,
  };
}

export function publishQuorumReached(ackCount: number, ackQuorum = config.ackQuorum): boolean {
  return ackCount >= ackQuorum;
}

export function relayFetchPlans(group: GroupRecord, relayName: string): RelayFetchPlan[] {
  if (group.events.length === 0) {
    return [{ cursorKey: `${relayName}:topic`, opts: { limit: FETCH_LIMIT } }];
  }
  if (relayName === "nostr") {
    const cursorKey = `${relayName}:topic`;
    return [{ cursorKey, opts: fetchOpts(group.meta.cursors[cursorKey]) }];
  }
  return knownDeviceIds(group).map((author) => {
    const cursorKey = `${relayName}:author:${author}`;
    return { cursorKey, opts: fetchOpts(group.meta.cursors[cursorKey], author) };
  });
}

export function createRelays(group: GroupRecord): Relay[] {
  const relaySettings = normalizeRelaySettings(group.meta.relaySettings, {
    operatedEndpoint: config.relayEndpoint,
    nostrRelays: config.nostrRelays,
  });
  group.meta.relaySettings = relaySettings;
  const relays: Relay[] = [];
  if (relaySettings.useOperated) relays.push(new HttpRelay(relaySettings.operatedEndpoint));
  const nostr = new NostrRelay(group.meta.nostrSk, relaySettings.nostrRelays);
  group.meta.nostrSk = nostr.secretHex();
  if (relaySettings.nostrRelays.length > 0) relays.push(nostr);
  return relays;
}

export interface SyncOnceOptions {
  /**
   * CR-011 A13 mitigation: maximum relay message size in bytes. Production
   * resolves this from NIP-11 max_message_length of the default Nostr relays;
   * tests inject recorded measurements directly. `null` disables limiting.
   */
  messageLimitBytes?: number | null;
}

async function defaultMessageLimitBytes(): Promise<number | null> {
  const limits = await Promise.all(config.nostrRelays.map((url) => fetchMaxMessageLength(url)));
  return resolveMessageLimit(limits, Number.POSITIVE_INFINITY);
}

export async function syncOnce(groupId: string, relayOverride?: Relay[], opts: SyncOnceOptions = {}): Promise<SyncResult> {
  const group = await readGroup(groupId);
  const relays = relayOverride ?? createRelays(group);
  if (!relayOverride) await saveMeta(group.meta);
  const { secret, key } = await getGroupCrypto(group);
  const writeProof = await relayWriteProof(secret, group.tagHex);
  const outbound = await pendingOutboundEventRows(groupId);
  const batchRows = outbound.slice(0, config.batchMaxEvents);
  const localBatchRows = batchRows.filter((row) => row.syncState === "local");
  const batch = batchRows.map((row) => row.event);
  const result: SyncResult = {
    published: 0,
    confirmed: 0,
    received: 0,
    buffered: 0,
    dropped: 0,
    snapshotsPublished: 0,
    snapshotsSeen: 0,
    errors: [],
    diagnostics: [],
  };

  if (batch.length > 0) {
    // CR-011 A13 mitigation, part 1: size the batch against the weakest relay's
    // NIP-11 max_message_length before publishing. A probe encryption projects
    // the serialized size; the batch is sliced to fit and the remainder waits
    // for the next polling cycle instead of being rejected by the relay.
    let effectiveRows = batchRows;
    const limit = opts.messageLimitBytes !== undefined ? opts.messageLimitBytes : await defaultMessageLimitBytes();
    if (limit !== null && Number.isFinite(limit)) {
      const target = limit - BATCH_SAFETY_MARGIN_BYTES;
      const probeBlob = await encryptEvents(key, batch);
      const fitted = fitCountWithinLimit(batch.length, (n) => projectBatchSize(probeBlob.length, batch.length, n), target);
      if (fitted > 0 && fitted < effectiveRows.length) effectiveRows = effectiveRows.slice(0, fitted);
    }

    const publishBlob = async (events: Event[]): Promise<string> => encryptEvents(key, events);
    const collectAcks = async (blob: string) =>
      Promise.all(
        relays.map(async (relay) => {
          try {
            return { relay: relay.name, ack: await relay.publish(group.tagHex, group.deviceId, blob, writeProof) };
          } catch (reason) {
            return { relay: relay.name, reason };
          }
        }),
      );
    const countOk = (ackResults: Awaited<ReturnType<typeof collectAcks>>) =>
      ackResults.filter((entry) => "ack" in entry && (entry.ack.ok || isDuplicateRelayAck(entry.ack.reason))).length;

    const localEffectiveRows = effectiveRows.filter((row) => row.syncState === "local");
    const blob = await publishBlob(effectiveRows.map((row) => row.event));
    const acks = await collectAcks(blob);
    const ok = countOk(acks);
    for (const ack of acks) {
      if ("reason" in ack) {
        const reason = ack.reason instanceof Error ? ack.reason.message : String(ack.reason);
        result.errors.push(reason);
        result.diagnostics.push(classifyRelayIssue({ relay: ack.relay, operation: "publish", reason }));
      } else if (!ack.ack.ok && ack.ack.reason) {
        const diagnostic = classifyRelayIssue({ relay: ack.relay, operation: "publish", reason: ack.ack.reason });
        result.diagnostics.push(diagnostic);
        if (diagnostic.severity !== "info") result.errors.push(ack.ack.reason);
      }
    }
    // Cap effective quorum at the number of available relays: if only Nostr relays are
    // present (operated relay not configured), min(1, 2) = 1 so any single Nostr ACK
    // satisfies quorum rather than leaving events permanently local.
    const ackQuorum = Math.min(relays.length, config.ackQuorum);
    const publishQuorumMet = publishQuorumReached(ok, ackQuorum);
    if (publishQuorumMet) {
      await markEvents(groupId, localEffectiveRows.map((row) => row.event.id), "published");
      result.published = localEffectiveRows.length;
    } else if (localBatchRows.length > 0) {
      // CR-011 A13 mitigation, part 2 — per-event fallback (the load-bearing half).
      // CR-010 measured relays rejecting or partially acknowledging batch messages
      // even under their byte caps, so when the batched write cannot reach quorum,
      // each pending ledger event is published as its own message and kept only if
      // it reaches quorum on its own.
      let fallbackPublished = 0;
      for (const row of localBatchRows) {
        const singleBlob = await publishBlob([row.event]);
        const singleAcks = await collectAcks(singleBlob);
        if (publishQuorumReached(countOk(singleAcks), ackQuorum)) {
          await markEvents(groupId, [row.event.id], "published");
          fallbackPublished += 1;
        }
      }
      if (fallbackPublished === 0) {
        result.errors.push(`relay quorum not reached (${ok}/${ackQuorum} acknowledgements)`);
      } else {
        result.published = fallbackPublished;
      }
    }
  }

  const fetchJobs = relays.flatMap((relay) => relayFetchPlans(group, relay.name).map((plan) => ({ relay, plan })));
  const fetched = await Promise.all(
    fetchJobs.map(async ({ relay, plan }) => {
      try {
        return { relay: relay.name, cursorKey: plan.cursorKey, entries: await relay.fetch(group.tagHex, plan.opts) };
      } catch (reason) {
        return { relay: relay.name, cursorKey: plan.cursorKey, reason };
      }
    }),
  );
  const remoteEvents: Event[] = [];
  const snapshots: SnapshotEnvelope[] = [];
  const readBackCounts = new Map<string, number>();
  const cursorUpdates: Record<string, string> = {};
  for (const relayResult of fetched) {
    if ("reason" in relayResult) {
      const reason = relayResult.reason instanceof Error ? relayResult.reason.message : String(relayResult.reason);
      result.errors.push(reason);
      result.diagnostics.push(classifyRelayIssue({ relay: relayResult.relay, operation: "fetch", reason }));
      continue;
    }
    const lastEntry = relayResult.entries.at(-1);
    if (lastEntry) cursorUpdates[relayResult.cursorKey] = lastEntry.cursor;
    for (const entry of relayResult.entries) {
      try {
        const envelope = await decryptEnvelope(key, entry.blob);
        if (envelope.type === "events") {
          remoteEvents.push(...envelope.events);
          for (const event of envelope.events) readBackCounts.set(event.id, (readBackCounts.get(event.id) ?? 0) + 1);
        } else {
          snapshots.push(envelope);
        }
      } catch {
        result.errors.push("discarded undecryptable relay blob");
      }
    }
  }
  if (Object.keys(cursorUpdates).length > 0) {
    await updateMeta(groupId, (meta) => ({ ...meta, cursors: { ...meta.cursors, ...cursorUpdates } }));
  }
  result.snapshotsSeen = snapshots.length;
  const bestSnapshot = snapshots.sort((a, b) => b.seq - a.seq)[0];
  if (bestSnapshot && group.events.length === 0) {
    await updateTransportVectors(groupId, bestSnapshot.vv, group.meta.discardVector);
  }
  const dueBuffered = await dueBufferedEvents(groupId);
  const transport = admitTransportEvents([...dueBuffered, ...remoteEvents], group.events, group.meta.discardVector, {
    now: Date.now(),
    supportedVersion: config.schemaVersion,
    maxFutureDriftMs: config.maxFutureDriftMs,
    capUnknownAuthor: config.capUnknownAuthor,
    capKnownAuthor: config.capKnownAuthor,
    capGroupTotal: config.capGroupTotal,
    bufferMaxEvents: config.driftBufferMax,
  });
  await removeBufferedEvents(groupId, [
    ...transport.admitted.map((event) => event.id),
    ...transport.dropped.map((drop) => drop.event.id),
  ]);
  await putBufferedEvents(groupId, transport.buffered);
  await updateTransportVectors(groupId, transport.transportVector, transport.discardVector);
  result.buffered = transport.buffered.length;
  result.dropped = transport.dropped.length;

  const confirmedIds = batchRows
    .filter((row) => row.syncState === "published" || (row.syncState === "local" && result.published > 0))
    .map((row) => row.event.id)
    .filter((id) => (readBackCounts.get(id) ?? 0) > 0);
  if (confirmedIds.length > 0) {
    await markEvents(groupId, confirmedIds, "confirmed");
    result.confirmed = confirmedIds.length;
  }
  result.received = await upsertRemoteEvents(groupId, transport.admitted);
  const snapshotEvery = Math.max(1, config.snapshotEvery);
  const snapshotEvents = await confirmedEvents(groupId);
  const snapshotSeq = Math.floor(snapshotEvents.length / snapshotEvery) * snapshotEvery;
  if (snapshotSeq > (group.meta.lastSnapshotSeq ?? 0)) {
    const snapshot: SnapshotEnvelope = {
      type: "snapshot",
      seq: snapshotSeq,
      vv: vectorFromEvents(snapshotEvents),
      state: canonicalState(fold(snapshotEvents, { supportedVersion: config.schemaVersion })),
      createdAt: Date.now(),
    };
    const blob = await encryptEnvelope(key, snapshot);
    const acks = await Promise.all(
      relays.map(async (relay) => {
        try {
          return { relay: relay.name, ack: await relay.publish(group.tagHex, group.deviceId, blob, writeProof) };
        } catch (reason) {
          return { relay: relay.name, reason };
        }
      }),
    );
    const ok = acks.filter((ack) => "ack" in ack && (ack.ack.ok || isDuplicateRelayAck(ack.ack.reason))).length;
    for (const ack of acks) {
      if ("reason" in ack) {
        const reason = ack.reason instanceof Error ? ack.reason.message : String(ack.reason);
        result.errors.push(reason);
        result.diagnostics.push(classifyRelayIssue({ relay: ack.relay, operation: "snapshot", reason }));
      } else if (!ack.ack.ok && ack.ack.reason) {
        const diagnostic = classifyRelayIssue({ relay: ack.relay, operation: "snapshot", reason: ack.ack.reason });
        result.diagnostics.push(diagnostic);
        if (diagnostic.severity !== "info") result.errors.push(ack.ack.reason);
      }
    }
    if (publishQuorumReached(ok, Math.min(relays.length, config.ackQuorum))) {
      await markSnapshotPublished(groupId, snapshotSeq);
      result.snapshotsPublished = 1;
    }
  }
  const refreshed = await readGroup(groupId);
  const nextMeta = { ...refreshed.meta, lastSyncAt: Date.now() };
  if (result.errors[0]) nextMeta.lastSyncError = result.errors[0];
  else delete nextMeta.lastSyncError;
  await saveMeta(nextMeta);
  return result;
}
