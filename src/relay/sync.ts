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
  updateMeta,
  updateTransportVectors,
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

import { coordinatedSync, emptySyncResult, syncNetworkBudget, SYNC_FALLBACK_LIMIT } from "./sync-cycle";

const FETCH_LIMIT = 500;

interface RelayFetchPlan {
  cursorKey: string;
  opts: { author?: string; cursor?: string | null; limit?: number };
}

function fetchOpts(cursor: string | null | undefined): RelayFetchPlan["opts"] {
  return {
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
  // A known-author directory cannot discover a newly joined device. The operated
  // relay's ordered group stream supports bounded incremental reads directly.
  // Keep an existing topic cursor; never promote an author cursor to a topic
  // cursor, because doing so could skip a different device's earlier events.
  const cursorKey = `${relayName}:topic`;
  return [{ cursorKey, opts: fetchOpts(group.meta.cursors[cursorKey]) }];
}

export function createRelays(group: GroupRecord): Relay[] {
  const relaySettings = normalizeRelaySettings(group.meta.relaySettings, {
    operatedEndpoint: config.relayEndpoint,
    nostrRelays: config.nostrRelays,
  });
  group.meta.relaySettings = relaySettings;
  const relays: Relay[] = [];
  if (relaySettings.useOperated) relays.push(new HttpRelay(relaySettings.operatedEndpoint));
  if (relaySettings.nostrRelays.length > 0) {
    const nostr = new NostrRelay(group.meta.nostrSk, relaySettings.nostrRelays);
    group.meta.nostrSk = nostr.secretHex();
    relays.push(nostr);
  }
  return relays;
}

export interface SyncOnceOptions {
  /**
   * CR-011 A13 mitigation: maximum relay message size in bytes. Production
   * resolves this from NIP-11 max_message_length of this trip's configured Nostr relays;
   * tests inject recorded measurements directly. `null` disables limiting.
   */
  messageLimitBytes?: number | null;
  /** Network work only; local durable commits finish after expiry. Capped at 60s. */
  networkBudgetMs?: number;
}

async function defaultMessageLimitBytes(relays: Relay[], signal: AbortSignal): Promise<number | null> {
  const urls = [...new Set(relays.flatMap((relay) => relay instanceof NostrRelay ? relay.relayUrls : []))];
  const limits = await Promise.all(urls.map((url) => fetchMaxMessageLength(url, fetch, signal)));
  return resolveMessageLimit(limits, Number.POSITIVE_INFINITY);
}

export function syncOnce(groupId: string, relayOverride?: Relay[], opts: SyncOnceOptions = {}): Promise<SyncResult> {
  return coordinatedSync(groupId, () => runSyncCycle(groupId, relayOverride, opts));
}

async function runSyncCycle(groupId: string, relayOverride: Relay[] | undefined, opts: SyncOnceOptions): Promise<SyncResult> {
  const group = await readGroup(groupId);
  const relays = relayOverride ?? createRelays(group);
  const deadline = syncNetworkBudget(opts.networkBudgetMs);
  try {
    if (!relayOverride) await updateMeta(groupId, (meta) => ({ ...meta, nostrSk: group.meta.nostrSk,
      ...(group.meta.relaySettings ? { relaySettings: group.meta.relaySettings } : {}) }));
    const { secret, key } = await getGroupCrypto(group);
    const writeProof = await relayWriteProof(secret, group.tagHex);
    const outbound = await pendingOutboundEventRows(groupId);
    const localRows = outbound.filter((row) => row.syncState === "local");
    const publishedRows = outbound.filter((row) => row.syncState === "published");
    const batchRows = [...localRows, ...publishedRows].slice(0, config.batchMaxEvents);
    const confirmationEligible = new Set(publishedRows.map((row) => row.event.id));
    const batch = batchRows.map((row) => row.event);
    const result = emptySyncResult();

    if (batch.length > 0) {
      // CR-011 A13 mitigation, part 1: size the batch against the weakest relay's
      // NIP-11 max_message_length before publishing. A probe encryption projects
      // the serialized size; the batch is sliced to fit and the remainder waits
      // for the next polling cycle instead of being rejected by the relay.
      let effectiveRows = batchRows;
      const limit = opts.messageLimitBytes !== undefined ? opts.messageLimitBytes : await deadline.run((signal) => defaultMessageLimitBytes(relays, signal)).catch((reason) => {
        result.errors.push(reason instanceof Error ? reason.message : String(reason));
        return null;
      });
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
              return { relay: relay.name, ack: await deadline.run((signal) => relay.publish(group.tagHex, group.deviceId, blob, writeProof, { signal })) };
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
      // Exclude relays that are definitively unconfigured (e.g. operated relay without
      // Upstash credentials) from the effective quorum. Those relays cannot store data
      // regardless of event content, so requiring their ACK would leave events permanently
      // local in Nostr-only deployments.
      const isRelayUnconfigured = (reason?: string): boolean => reason !== undefined && reason.includes("not configured");
      const unconfiguredCount = acks.filter((a) => "ack" in a && !a.ack.ok && isRelayUnconfigured(a.ack.reason)).length;
      const ackQuorum = Math.max(1, Math.min(relays.length - unconfiguredCount, config.ackQuorum));
      const publishQuorumMet = publishQuorumReached(ok, ackQuorum);
      if (publishQuorumMet) {
        await markEvents(groupId, localEffectiveRows.map((row) => row.event.id), "published");
        for (const row of localEffectiveRows) confirmationEligible.add(row.event.id);
        result.published = localEffectiveRows.length;
      } else if (localRows.length > 0 && !deadline.signal.aborted) {
        // CR-011 A13 mitigation, part 2 — per-event fallback (the load-bearing half).
        // CR-010 measured relays rejecting or partially acknowledging batch messages
        // even under their byte caps, so when the batched write cannot reach quorum,
        // each pending ledger event is published as its own message and kept only if
        // it reaches quorum on its own.
        let fallbackPublished = 0;
        const start = Math.max(0, localRows.findIndex((row) => row.event.id === group.meta.syncFallbackNextId));
        const fallbackRows = [...localRows.slice(start), ...localRows.slice(0, start)];
        for (const [index, row] of fallbackRows.slice(0, SYNC_FALLBACK_LIMIT).entries()) {
          if (deadline.signal.aborted) break;
          const singleBlob = await publishBlob([row.event]);
          const singleAcks = await collectAcks(singleBlob);
          if (publishQuorumReached(countOk(singleAcks), ackQuorum)) {
            await markEvents(groupId, [row.event.id], "published");
            confirmationEligible.add(row.event.id);
            fallbackPublished += 1;
          }
          if (!deadline.signal.aborted) {
            const nextRow = fallbackRows[(index + 1) % fallbackRows.length];
            if (nextRow) await updateMeta(groupId, (meta) => ({ ...meta, syncFallbackNextId: nextRow.event.id }));
          }
        }
        if (fallbackPublished === 0) {
          result.errors.push(`relay quorum not reached (${ok}/${ackQuorum} acknowledgements)`);
        } else {
          result.published = fallbackPublished;
        }
      }
    }

    const fetchJobs = (deadline.signal.aborted ? [] : relays).flatMap((relay) => relayFetchPlans(group, relay.name).map((plan) => ({ relay, plan })));
    const fetched = await Promise.all(
      fetchJobs.map(async ({ relay, plan }) => {
        try {
          return { relay: relay.name, cursorKey: plan.cursorKey, entries: await deadline.run((signal) => relay.fetch(group.tagHex, plan.opts, { signal })) };
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
    result.snapshotsSeen = snapshots.length;
    const bestSnapshot = snapshots.sort((a, b) => b.seq - a.seq)[0];
    if (bestSnapshot && group.events.length === 0) {
      await updateTransportVectors(groupId, bestSnapshot.vv, group.meta.discardVector);
    }
    const dueBuffered = await dueBufferedEvents(groupId);
    // Relay pages and a legacy-cursor replay can repeat already stored events.
    // Count each new event once; duplicate delivery must not exhaust admission
    // budgets and cause a later, genuinely new event to be discarded.
    const seenIds = new Set(group.events.map((event) => event.id));
    const incoming = [...dueBuffered, ...remoteEvents].filter((event) => {
      if (seenIds.has(event.id)) return false;
      seenIds.add(event.id);
      return true;
    });
    const transport = admitTransportEvents(incoming, group.events, group.meta.discardVector, {
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

    const confirmedIds = [...confirmationEligible]
      .filter((id) => (readBackCounts.get(id) ?? 0) > 0);
    if (confirmedIds.length > 0) {
      await markEvents(groupId, confirmedIds, "confirmed");
      result.confirmed = confirmedIds.length;
    }
    // Commit the read checkpoint in the same transaction as the received events.
    // A failed local write must leave the relay page available for the next retry.
    result.received = await upsertRemoteEvents(groupId, transport.admitted, cursorUpdates);
    const snapshotEvery = Math.max(1, config.snapshotEvery);
    const snapshotEvents = await confirmedEvents(groupId);
    const snapshotSeq = Math.floor(snapshotEvents.length / snapshotEvery) * snapshotEvery;
    if (!deadline.signal.aborted && snapshotSeq > (group.meta.lastSnapshotSeq ?? 0)) {
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
            return { relay: relay.name, ack: await deadline.run((signal) => relay.publish(group.tagHex, group.deviceId, blob, writeProof, { signal })) };
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
      if (publishQuorumReached(ok, Math.max(1, Math.min(relays.length, config.ackQuorum)))) {
        await markSnapshotPublished(groupId, snapshotSeq);
        result.snapshotsPublished = 1;
      }
    }
    if (deadline.signal.aborted && !result.errors.includes(deadline.signal.reason.message)) {
      result.errors.push(deadline.signal.reason.message);
    }
    await updateMeta(groupId, (meta) => {
      const nextMeta = { ...meta, lastSyncAt: Date.now() };
      if (result.errors[0]) nextMeta.lastSyncError = result.errors[0];
      else delete nextMeta.lastSyncError;
      return nextMeta;
    });
    return result;
  } finally {
    deadline.close();
    if (!relayOverride) for (const relay of relays) relay.close?.();
  }
}
