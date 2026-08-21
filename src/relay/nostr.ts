import { finalizeEvent, generateSecretKey, getPublicKey, SimplePool } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@/crypto/bytes";
import { config } from "@/config";
import type { AckResult, Relay, RelayEntry } from "./types";

const GROUP_TAG_RE = /^[0-9a-f]{64}$/;

function secretFromHex(hex?: string): Uint8Array {
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return hexToBytes(hex);
  return generateSecretKey();
}

export function assertLowercaseGroupTag(tag: string): void {
  if (!GROUP_TAG_RE.test(tag)) throw new Error("invalid lowercase group tag");
}

export function nostrEventTemplate(tag: string, blob: string, kind: number, nowMs = Date.now()) {
  assertLowercaseGroupTag(tag);
  return {
    kind,
    created_at: Math.floor(nowMs / 1000),
    tags: [
      ["t", tag],
      ["s", String(nowMs)],
    ],
    content: blob,
  };
}

export function nostrFetchFilter(tag: string, kind: number, opts: { author?: string; limit?: number }) {
  assertLowercaseGroupTag(tag);
  return {
    kinds: [kind],
    "#t": [tag],
    ...(opts.author ? { authors: [opts.author] } : {}),
    limit: opts.limit ?? 500,
  };
}

export class NostrRelay implements Relay {
  name = "nostr";
  private pool = new SimplePool();
  private sk: Uint8Array;
  author: string;

  constructor(secretHex?: string, readonly relayUrls = config.nostrRelays, private kind = config.nostrKind) {
    this.sk = secretFromHex(secretHex);
    this.author = getPublicKey(this.sk);
  }

  secretHex(): string {
    return bytesToHex(this.sk);
  }

  async publish(tag: string, _author: string, blob: string): Promise<AckResult> {
    try {
      const event = finalizeEvent(nostrEventTemplate(tag, blob, this.kind), this.sk);
      const pubs = this.pool.publish(this.relayUrls, event);
      const settled = await Promise.allSettled(pubs);
      const ok = settled.filter((result) => result.status === "fulfilled").length;
      return ok > 0 ? { ok: true, cursor: event.id } : { ok: false, reason: "no nostr relay accepted publish" };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async fetch(tag: string, opts: { author?: string; cursor?: string | null; limit?: number }): Promise<RelayEntry[]> {
    const filter = nostrFetchFilter(tag, this.kind, opts);
    const events = await this.pool.querySync(this.relayUrls, filter);
    return events
      .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))
      .filter((event) => !opts.cursor || event.id > opts.cursor)
      .map((event) => ({ blob: event.content, author: event.pubkey, cursor: event.id }));
  }
}
