import { admitTransportEvents, canonicalState, fold, type Event } from "@theprawnsplit/core";
import { config } from "@/config";
import { decryptEnvelope, encryptEnvelope, encryptEvents, type SnapshotEnvelope } from "@/crypto/envelope";
import { relayWriteProof } from "@/crypto/group";
import { confirmedEvents, dueBufferedEvents, getGroupCrypto, markEvents, markSnapshotPublished,
  pendingOutboundEventRows, promoteLedger, readGroup, resolveIncomingEventConflicts, updateMeta,
  vectorFromEvents, type GroupRecord } from "@/db/repo";
import { eventFingerprint } from "@/lib/event-fingerprint";
import type { HttpRelay } from "./http";
import { recoverNostrPage, type NostrRecoverySource } from "./nostr-recovery";
import { prepareSourcePackets, readSourceFragment } from "./source-archive";
import { recoveryRepository, type RecoveryRepository, type RecoveryState, type RecoveryPacket } from "./recovery-db";
import { emptySyncResult, ownsCrossTabSync, syncNetworkBudget } from "./sync-cycle";
import type { RelayEntry } from "./types";

const MAX_BLOB_BYTES = 131_072;
const validCursor = (cursor: string): boolean => /^(0|[1-9][0-9]{0,19})-(0|[1-9][0-9]{0,19})$/.test(cursor)
  && cursor.split("-").every((part) => BigInt(part) <= 18_446_744_073_709_551_615n);
const after = (a: string, b: string): boolean => {
  const left = a.split("-").map(BigInt), right = b.split("-").map(BigInt);
  return left[0]! > right[0]! || (left[0] === right[0] && left[1]! > right[1]!);
};
// DATA-005: eventFingerprint now lives in src/lib/event-fingerprint.ts,
// shared with upsertRemoteEvents and the legacy sync path's readback
// confirmation check, instead of being duplicated privately in this file.

/** Only the explicitly migrated generation uses this path. No Nostr publish
 * operation is reachable here; its retained sources are read for late devices. */
export async function syncMigrated(groupId: string, operated: Pick<HttpRelay, "fetch" | "publish">,
  nostr: NostrRecoverySource | undefined, state: RecoveryState,
  deadline: ReturnType<typeof syncNetworkBudget>, repository: RecoveryRepository = recoveryRepository()) {
  const result = emptySyncResult();
  if (!ownsCrossTabSync(groupId)) {
    result.errors.push("This browser cannot safely coordinate sync across tabs; local history is preserved. Use an updated browser to sync.");
    await updateMeta(groupId, (meta) => ({ ...meta, lastSyncError: result.errors[0]! }));
    return result;
  }
  let group = await readGroup(groupId);
  const { secret, key } = await getGroupCrypto(group);
  const proof = await relayWriteProof(secret, group.tagHex);
  let sentPacket = false;

  const sendPending = async () => {
    const packet = state.pending;
    if (!packet) return;
    sentPacket = true;
    const ack = await deadline.run((signal) => operated.publish(group.tagHex, packet.author, packet.blob, proof, { signal }));
    if (!ack.ok || !ack.cursor || !validCursor(ack.cursor)) throw new Error("Encrypted changes remain on this device; relay receipt will retry");
    // A failed local receipt commit retains the persisted exact ciphertext.
    const next = { ...state };
    delete next.pending;
    await repository.acknowledge(next, packet.events);
    state = next;
    if (packet.snapshotSeq !== undefined) {
      await markSnapshotPublished(groupId, packet.snapshotSeq);
      result.snapshotsPublished += 1;
    } else {
      const local = new Set((await pendingOutboundEventRows(groupId)).filter((row) => row.syncState === "local").map((row) => row.event.id));
      const ids = packet.events.filter((event) => local.has(event.id)).map((event) => event.id);
      await markEvents(groupId, ids, "published");
      result.published += ids.length;
    }
  };

  const ingest = async (entries: RelayEntry[], operatedRead: boolean): Promise<boolean> => {
    group = await readGroup(groupId);
    const known = new Map(group.events.map((event) => [event.id, event]));
    const decoded = new Map<string, Event>();
    const sourceReceipts: string[] = [];
    let safeCheckpoint = true;
    for (const entry of entries) {
      try {
        const envelope = await decryptEnvelope(key, entry.blob);
        if (envelope.type === "snapshot") { result.snapshotsSeen += 1; continue; }
        if (!Array.isArray(envelope.events)) throw new Error("invalid envelope");
        if (envelope.sourceArchive !== undefined) {
          if (envelope.events.length) throw new Error("invalid source envelope");
          const { receipt } = await readSourceFragment(envelope.sourceArchive);
          if (operatedRead) sourceReceipts.push(receipt);
        }
        for (const event of envelope.events) {
          if (!event || typeof event.id !== "string") throw new Error("invalid event");
          const existing = decoded.get(event.id) ?? known.get(event.id);
          if (existing && await eventFingerprint(existing) !== await eventFingerprint(event)) {
            safeCheckpoint = false;
            result.errors.push("Conflicting event identity in recovered history; local history and checkpoint retained");
          } else decoded.set(event.id, event);
        }
      } catch {
        safeCheckpoint = false;
        result.errors.push("Unreadable recovered history; local history and checkpoint retained");
      }
    }
    const seen = new Set(known.keys());
    const incoming = [...await dueBufferedEvents(groupId), ...decoded.values()].filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id); return true;
    });
    const transport = admitTransportEvents(incoming, group.events, group.meta.discardVector, {
      now: Date.now(), supportedVersion: config.schemaVersion, maxFutureDriftMs: config.maxFutureDriftMs,
      capUnknownAuthor: config.capUnknownAuthor, capKnownAuthor: config.capKnownAuthor,
      capGroupTotal: config.capGroupTotal, bufferMaxEvents: config.driftBufferMax,
    });
    // A local admission limit/rejection never silently advances past unseen history.
    if (transport.dropped.length) {
      safeCheckpoint = false;
      result.errors.push("Some recovered history needs review before its checkpoint can advance");
    }
    const toInsert = await resolveIncomingEventConflicts(groupId, transport.admitted);
    // INTR-001: admitted rows, promoted-buffer removal and newly-buffered
    // additions all commit in the SAME atomic transaction — a crash/
    // interruption never removes a buffer entry without having durably
    // admitted it. Matches this path's existing admitted-only (not
    // dropped) buffer-removal scope.
    await promoteLedger(groupId, {
      admitted: toInsert,
      promotedBufferIds: transport.admitted.map((event) => event.id),
      newlyBuffered: transport.buffered,
      transportVector: transport.transportVector,
      discardVector: transport.discardVector,
    });
    result.received += toInsert.length;
    result.buffered += transport.buffered.length;
    result.dropped += transport.dropped.length;
    if (operatedRead) {
      const stored = new Map((await readGroup(groupId)).events.map((event) => [event.id, event]));
      const receipts: RecoveryPacket["events"] = [];
      for (const event of decoded.values()) {
        if (stored.has(event.id) && await eventFingerprint(stored.get(event.id)!) === await eventFingerprint(event)) {
          receipts.push({ id: event.id, fingerprint: await eventFingerprint(event) });
        }
      }
      await repository.acknowledge(state, receipts, sourceReceipts);
      const pending = new Set((await pendingOutboundEventRows(groupId)).map((row) => row.event.id));
      const ids = receipts.filter((event) => pending.has(event.id)).map((event) => event.id);
      await markEvents(groupId, ids, "confirmed");
      result.confirmed += ids.length;
    }
    return safeCheckpoint;
  };

  try {
    if (state.pending) {
      try { await sendPending(); } catch { result.errors.push("Encrypted changes remain on this device; relay receipt will retry"); }
    }
    // Re-read from the beginning for this generation, independent of a legacy
    // global confirmation/cursor. Only an empty page ends the initial scan:
    // a short page may merely have hit the server's serialized-byte ceiling.
    try {
      const entries = await deadline.run((signal) => operated.fetch(group.tagHex, { cursor: state.cursor ?? null, limit: 500 }, { signal }));
      let previous = state.cursor;
      for (const entry of entries) {
        if (!validCursor(entry.cursor) || (previous && !after(entry.cursor, previous))) throw new Error("Invalid operated recovery page");
        previous = entry.cursor;
      }
      if (await ingest(entries, true)) {
        state = { ...state, ...(previous ? { cursor: previous } : {}), initialReadDone: state.initialReadDone || entries.length === 0 };
        await repository.save(state);
      }
    } catch { result.errors.push("Operated history read will retry; local history and checkpoint retained"); }

    // Finish reading existing archive receipts before copying a source again.
    // A durable unfinished page blocks another source read, not new local edits.
    if (!state.sourcePending && state.initialReadDone && nostr?.relayUrls.length && !deadline.signal.aborted) {
      const url = nostr.relayUrls[state.nextNostr % nostr.relayUrls.length]!;
      // Rotate even when a source is offline/saturated, so one relay cannot
      // starve recovery from another. Never promote its failed checkpoint.
      state = { ...state, nextNostr: (state.nextNostr + 1) % nostr.relayUrls.length };
      await repository.save(state);
      try {
        const page = await deadline.run((signal) => recoverNostrPage(nostr, url, group.tagHex, state.nostr[url], { signal }));
        const packets = await prepareSourcePackets(key, url, page.entries, group.tagHex, config.nostrKind,
          (receipt) => repository.sourceCovered(state.scope, receipt));
        const safeCheckpoint = await ingest(page.entries, false);
        if (packets.length) {
          const next = { ...state, sourcePending: { sourceUrl: url, next: page.next, advanceCheckpoint: safeCheckpoint,
            author: group.deviceId, packets } };
          await repository.save(next);
          state = next;
        } else if (safeCheckpoint) {
          state = { ...state, nostr: { ...state.nostr, [url]: page.next } };
          await repository.save(state);
        }
        if (page.saturated) result.errors.push("Older relay history exceeds one timestamp page; recovery remains incomplete");
      } catch { result.errors.push("Older relay history will retry; its checkpoint is retained"); }
    }

    if (!state.pending && !sentPacket && !deadline.signal.aborted) {
      group = await readGroup(groupId);
      const outbound = await pendingOutboundEventRows(groupId);
      const pendingIds = new Set(outbound.map((row) => row.event.id));
      const candidates = [...outbound.map((row) => row.event), ...group.events.filter((event) => !pendingIds.has(event.id))];
      const events: Event[] = [];
      const receipts: RecoveryPacket["events"] = [];
      for (const event of candidates) {
        // Fresh local writes need not wait for a long initial history scan.
        if (!state.initialReadDone && !pendingIds.has(event.id)) continue;
        const fingerprint = await eventFingerprint(event);
        if (await repository.covered(state.scope, event.id, fingerprint)) continue;
        events.push(event); receipts.push({ id: event.id, fingerprint });
        if (events.length >= config.batchMaxEvents) break;
      }
      if (events.length) {
        let blob = await encryptEvents(key, events);
        while (new TextEncoder().encode(blob).byteLength > MAX_BLOB_BYTES && events.length > 1) {
          events.pop(); receipts.pop(); blob = await encryptEvents(key, events);
        }
        if (new TextEncoder().encode(blob).byteLength > MAX_BLOB_BYTES) {
          result.errors.push("A local event exceeds the relay size limit; it remains on this device");
        } else state = { ...state, pending: { blob, author: group.deviceId, events: receipts } };
      } else if (state.initialReadDone) {
        const confirmed = await confirmedEvents(groupId);
        const interval = Math.max(1, config.snapshotEvery);
        const seq = Math.floor(confirmed.length / interval) * interval;
        if (seq > (group.meta.lastSnapshotSeq ?? 0)) {
          const snapshot: SnapshotEnvelope = { type: "snapshot", seq, vv: vectorFromEvents(confirmed),
            state: canonicalState(fold(confirmed, { supportedVersion: config.schemaVersion })), createdAt: Date.now() };
          const blob = await encryptEnvelope(key, snapshot);
          if (new TextEncoder().encode(blob).byteLength <= MAX_BLOB_BYTES) {
            state = { ...state, pending: { blob, author: group.deviceId, events: [], snapshotSeq: seq } };
          } else result.errors.push("Snapshot exceeds the relay limit; ledger events remain preserved");
        }
      }
      if (state.pending) { await repository.save(state); await sendPending(); }
    }
    // One archive write per cycle, after ordinary ledger writes. Persisted
    // ciphertext survives a lost response and is idempotent in the operated DB.
    if (state.sourcePending && !deadline.signal.aborted) {
      try {
        const pending = state.sourcePending, packet = pending.packets[0]!;
        const ack = await deadline.run((signal) => operated.publish(group.tagHex, pending.author, packet.blob, proof, { signal }));
        if (!ack.ok || !ack.cursor || !validCursor(ack.cursor)) throw new Error("Missing source receipt");
        const next = { ...state };
        if (pending.packets.length > 1) next.sourcePending = { ...pending, packets: pending.packets.slice(1) };
        else {
          delete next.sourcePending;
          if (pending.advanceCheckpoint) next.nostr = { ...next.nostr, [pending.sourceUrl]: pending.next };
        }
        // The fragment receipt, remaining packets and final source checkpoint
        // share one transaction. A failed local commit replays identical bytes.
        await repository.acknowledge(next, [], [packet.receipt]);
        state = next;
      } catch { result.errors.push("Older history remains on this device until it is safely saved"); }
    }
  } catch {
    result.errors.push("Recovery was interrupted; encrypted local changes will retry");
  }
  await updateMeta(groupId, (meta) => {
    const next = { ...meta, lastSyncAt: Date.now() };
    if (result.errors[0]) next.lastSyncError = result.errors[0];
    else delete next.lastSyncError;
    return next;
  });
  return result;
}
