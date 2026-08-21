import type { CanonicalValue, Event } from "@theprawnsplit/core";
import { bigintReplacer, bigintReviver } from "@/lib/money";
import { base64ToBytes, bytesToBase64, utf8, utf8d } from "./bytes";

export interface EventEnvelope {
  type: "events";
  events: Event[];
}

export interface SnapshotEnvelope {
  type: "snapshot";
  seq: number;
  vv: Record<string, number>;
  state: CanonicalValue;
  createdAt: number;
}

export type RelayEnvelope = EventEnvelope | SnapshotEnvelope;

async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = utf8.encode(JSON.stringify(value, bigintReplacer));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const out = new Uint8Array(iv.length + encrypted.length);
  out.set(iv);
  out.set(encrypted, iv.length);
  return bytesToBase64(out);
}

export function eventEnvelope(events: Event[]): EventEnvelope {
  return { type: "events", events };
}

export async function encryptEnvelope(key: CryptoKey, envelope: RelayEnvelope): Promise<string> {
  return encryptJson(key, envelope);
}

export async function encryptEvents(key: CryptoKey, events: Event[]): Promise<string> {
  return encryptEnvelope(key, eventEnvelope(events));
}

export async function decryptEnvelope(key: CryptoKey, blob: string): Promise<RelayEnvelope> {
  const bytes = base64ToBytes(blob);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const decoded = JSON.parse(utf8d.decode(plaintext), bigintReviver) as Event[] | RelayEnvelope;
  if (Array.isArray(decoded)) return eventEnvelope(decoded);
  return decoded;
}

export async function decryptEvents(key: CryptoKey, blob: string): Promise<Event[]> {
  const envelope = await decryptEnvelope(key, blob);
  return envelope.type === "events" ? envelope.events : [];
}
