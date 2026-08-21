import { finalizeEvent, generateSecretKey, getPublicKey, SimplePool } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@/crypto/bytes";
import { config } from "@/config";
import type { AckResult, Relay, RelayEntry } from "./types";

function secretFromHex(hex?: string): Uint8Array {
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return hexToBytes(hex);
  return generateSecretKey();
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
      const event = finalizeEvent(
        {
          kind: this.kind,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["t", tag],
            ["s", String(Date.now())],
          ],
          content: blob,
        },
        this.sk,
      );
      const pubs = this.pool.publish(this.relayUrls, event);
      const settled = await Promise.allSettled(pubs);
      const ok = settled.filter((result) => result.status === "fulfilled").length;
      return ok > 0 ? { ok: true, cursor: event.id } : { ok: false, reason: "no nostr relay accepted publish" };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async fetch(tag: string, opts: { author?: string; cursor?: string | null; limit?: number }): Promise<RelayEntry[]> {
    const filter = {
      kinds: [this.kind],
      "#t": [tag],
      limit: opts.limit ?? 500,
    };
    if (opts.author) Object.assign(filter, { authors: [opts.author] });
    const events = await this.pool.querySync(this.relayUrls, filter);
    return events
      .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))
      .filter((event) => !opts.cursor || event.id > opts.cursor)
      .map((event) => ({ blob: event.content, author: event.pubkey, cursor: event.id }));
  }
}
