import type { Event } from "@theprawnsplit/core";
import { admitTransportEvents, canonicalState, fold } from "@theprawnsplit/core";
import { config } from "@/config";
import {
  dueBufferedEvents,
  getGroupCrypto,
  markSnapshotPublished,
  markEvents,
  pendingOutboundEvents,
  putBufferedEvents,
  readGroup,
  removeBufferedEvents,
  saveMeta,
  updateTransportVectors,
  upsertRemoteEvents,
  type GroupRecord,
} from "@/db/repo";
import { decryptEnvelope, encryptEnvelope, encryptEvents, type SnapshotEnvelope } from "@/crypto/envelope";
import { relayWriteProof } from "@/crypto/group";
import { HttpRelay } from "./http";
import { NostrRelay } from "./nostr";
import type { Relay, SyncResult } from "./types";

export function createRelays(group: GroupRecord): Relay[] {
  const nostr = new NostrRelay(group.meta.nostrSk);
  group.meta.nostrSk = nostr.secretHex();
  return [new HttpRelay(), nostr];
}

export async function syncOnce(groupId: string, relayOverride?: Relay[]): Promise<SyncResult> {
  const group = await readGroup(groupId);
  const relays = relayOverride ?? createRelays(group);
  if (!relayOverride) await saveMeta(group.meta);
  const { secret, key } = await getGroupCrypto(group);
  const writeProof = await relayWriteProof(secret, group.tagHex);
  const local = await pendingOutboundEvents(groupId);
  const batch = local.slice(0, config.batchMaxEvents);
  const result: SyncResult = {
    published: 0,
    confirmed: 0,
    received: 0,
    buffered: 0,
    dropped: 0,
    snapshotsPublished: 0,
    snapshotsSeen: 0,
    errors: [],
  };

  if (batch.length > 0) {
    const blob = await encryptEvents(key, batch);
    const acks = await Promise.allSettled(relays.map((relay) => relay.publish(group.tagHex, group.deviceId, blob, writeProof)));
    const ok = acks.filter((ack) => ack.status === "fulfilled" && ack.value.ok).length;
    for (const ack of acks) {
      if (ack.status === "rejected") result.errors.push(String(ack.reason));
      else if (!ack.value.ok && ack.value.reason) result.errors.push(ack.value.reason);
    }
    if (ok > 0) {
      await markEvents(groupId, batch.map((event) => event.id), "published");
      result.published = batch.length;
    }
  }

  const fetched = await Promise.allSettled(relays.map((relay) => relay.fetch(group.tagHex, { limit: 500 })));
  const remoteEvents: Event[] = [];
  const snapshots: SnapshotEnvelope[] = [];
  const readBackCounts = new Map<string, number>();
  for (const relayResult of fetched) {
    if (relayResult.status === "rejected") {
      result.errors.push(String(relayResult.reason));
      continue;
    }
    for (const entry of relayResult.value) {
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

  const confirmedIds = batch.map((event) => event.id).filter((id) => (readBackCounts.get(id) ?? 0) > 0);
  if (confirmedIds.length > 0) {
    await markEvents(groupId, confirmedIds, "confirmed");
    result.confirmed = confirmedIds.length;
  }
  result.received = await upsertRemoteEvents(groupId, transport.admitted);
  const snapshotEvery = Math.max(1, config.snapshotEvery);
  const snapshotSeq = Math.floor((group.events.length + result.received) / snapshotEvery) * snapshotEvery;
  if (snapshotSeq > (group.meta.lastSnapshotSeq ?? 0)) {
    const latest = await readGroup(groupId);
    const snapshot: SnapshotEnvelope = {
      type: "snapshot",
      seq: snapshotSeq,
      vv: latest.meta.versionVector,
      state: canonicalState(fold(latest.events, { supportedVersion: config.schemaVersion })),
      createdAt: Date.now(),
    };
    const blob = await encryptEnvelope(key, snapshot);
    const acks = await Promise.allSettled(relays.map((relay) => relay.publish(group.tagHex, group.deviceId, blob, writeProof)));
    const ok = acks.some((ack) => ack.status === "fulfilled" && ack.value.ok);
    if (ok) {
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
