import { verifyEvent, type Event as NostrEvent } from "nostr-tools";
import { base64ToBytes, bytesToBase64, bytesToHex, utf8 } from "@/crypto/bytes";
import { encryptEnvelope } from "@/crypto/envelope";
import type { RelayEntry } from "./types";

const MAX_SOURCE_BYTES = 2_100_000;
const CHUNK_BYTES = 32_768;
const HEX = /^[a-f0-9]{64}$/;
function invalid(): never { throw new Error("Unverified original history; checkpoint retained"); }
const digest = async (bytes: Uint8Array<ArrayBuffer>) => bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));

export interface NostrSourceFragment {
  format: "nostr-json-v1";
  sourceUrl: string;
  eventId: string;
  sha256: string;
  totalBytes: number;
  index: number;
  count: number;
  chunkSha256: string;
  data: string;
}
export interface SourcePacket { blob: string; receipt: string }

function validSourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "wss:" && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

function signedSource(raw: string, tag: string, kind: number): NostrEvent {
  const event = JSON.parse(raw) as NostrEvent;
  if (!event || !verifyEvent(event) || event.kind !== kind || !Number.isSafeInteger(event.created_at)
      || event.created_at < 0 || !event.tags.some(([name, value]) => name === "t" && value === tag)) invalid();
  return event;
}

/** Validate each retained byte before admitting a receipt. Partial objects are
 * useful receipts only for the identical original hash, position and contents. */
export async function readSourceFragment(value: unknown): Promise<{ fragment: NostrSourceFragment; bytes: Uint8Array<ArrayBuffer>; receipt: string }> {
  if (!value || typeof value !== "object") invalid();
  const fragment = value as NostrSourceFragment;
  if (fragment.format !== "nostr-json-v1" || !validSourceUrl(fragment.sourceUrl)
      || ![fragment.eventId, fragment.sha256, fragment.chunkSha256].every((part) => typeof part === "string" && HEX.test(part))
      || !Number.isSafeInteger(fragment.totalBytes) || fragment.totalBytes < 1 || fragment.totalBytes > MAX_SOURCE_BYTES
      || !Number.isSafeInteger(fragment.index) || !Number.isSafeInteger(fragment.count)
      || fragment.count !== Math.ceil(fragment.totalBytes / CHUNK_BYTES) || fragment.index < 0 || fragment.index >= fragment.count
      || typeof fragment.data !== "string" || fragment.data.length > Math.ceil(CHUNK_BYTES / 3) * 4) invalid();
  const bytes = new Uint8Array(base64ToBytes(fragment.data));
  const length = Math.min(CHUNK_BYTES, fragment.totalBytes - fragment.index * CHUNK_BYTES);
  if (bytes.length !== length || bytesToBase64(bytes) !== fragment.data || await digest(bytes) !== fragment.chunkSha256) invalid();
  const receipt = await digest(utf8.encode(JSON.stringify([fragment.format, fragment.sourceUrl, fragment.eventId,
    fragment.sha256, fragment.totalBytes, fragment.index, fragment.count, fragment.chunkSha256])));
  return { fragment, bytes, receipt };
}

/** Recover one complete original object, including unknown fields and whitespace.
 * This deliberately fails on partial, mixed or altered retained fragments. */
export async function restoreNostrSource(values: unknown[], tag: string, kind: number): Promise<string> {
  if (!values.length || values.length > Math.ceil(MAX_SOURCE_BYTES / CHUNK_BYTES)) invalid();
  const parts = await Promise.all(values.map(readSourceFragment));
  const first = parts[0]!.fragment;
  if (parts.length !== first.count || new Set(parts.map(({ fragment }) => fragment.index)).size !== first.count) invalid();
  const bytes = new Uint8Array(first.totalBytes);
  for (const part of parts) {
    const item = part.fragment;
    if (item.sourceUrl !== first.sourceUrl || item.eventId !== first.eventId || item.sha256 !== first.sha256
        || item.totalBytes !== first.totalBytes || item.count !== first.count) invalid();
    bytes.set(part.bytes, item.index * CHUNK_BYTES);
  }
  if (await digest(bytes) !== first.sha256) invalid();
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (signedSource(raw, tag, kind).id !== first.eventId) invalid();
  return raw;
}

/** A bounded page becomes durable exact-ciphertext retry packets. Existing relay
 * proof checks, row limits and measured capacity guards apply to every fragment. */
export async function prepareSourcePackets(key: CryptoKey, sourceUrl: string, entries: RelayEntry[], tag: string,
  kind: number, covered: (receipt: string) => Promise<boolean>): Promise<SourcePacket[]> {
  if (!validSourceUrl(sourceUrl) || entries.length > 50) invalid();
  let totalBytes = 0;
  const packets: SourcePacket[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const raw = entry.sourceEventJson;
    if (typeof raw !== "string") invalid();
    const bytes = utf8.encode(raw);
    totalBytes += bytes.length;
    if (totalBytes > MAX_SOURCE_BYTES || new TextDecoder("utf-8", { fatal: true }).decode(bytes) !== raw) invalid();
    const event = signedSource(raw, tag, kind);
    if (event.pubkey !== entry.author || event.content !== entry.blob || String(event.created_at) !== entry.cursor) invalid();
    const sha256 = await digest(bytes), count = Math.ceil(bytes.length / CHUNK_BYTES);
    for (let index = 0; index < count; index += 1) {
      const chunk = bytes.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
      const fragment: NostrSourceFragment = { format: "nostr-json-v1", sourceUrl, eventId: event.id, sha256,
        totalBytes: bytes.length, index, count, chunkSha256: await digest(chunk), data: bytesToBase64(chunk) };
      const { receipt } = await readSourceFragment(fragment);
      if (seen.has(receipt) || await covered(receipt)) continue;
      seen.add(receipt);
      const blob = await encryptEnvelope(key, { type: "events", events: [], sourceArchive: fragment });
      if (blob.length > 131_072 || packets.length >= 128) invalid();
      packets.push({ blob, receipt });
    }
  }
  return packets;
}
