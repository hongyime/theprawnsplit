import { compareCodepoints } from "@theprawnsplit/core";
import { finalizeEvent, generateSecretKey, getPublicKey, SimplePool } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@/crypto/bytes";
import { config } from "@/config";
import type { AckResult, Relay, RelayEntry, RelayRequestOptions } from "./types";
import { withRequestDeadline } from "./request-deadline";
import { fetchNostrRecoveryPage } from "./nostr-recovery-transport";
import { isEndpointAvailable, type EndpointPolicyMap } from "./endpoint-policy";

export interface NostrEventLike {
  id: string;
  created_at: number;
  content: string;
  pubkey: string;
}

export function selectNostrEntries(events: NostrEventLike[], opts: { since?: number | null }): RelayEntry[] {
  // CR-012: the cursor on this path is a created_at watermark (seconds), not an
  // event id. Event ids are sha256 digests — effectively random — so filtering
  // them against the watermark discarded an arbitrary fraction of fresh events.
  // The relay applies `since` server-side; the boundary second may re-deliver
  // events, which ingest dedupes by id (REQ-SYN-09).
  const seen = new Set<string>();
  return events
    .filter((event) => (seen.has(event.id) ? false : (seen.add(event.id), true)))
    .sort((a, b) => a.created_at - b.created_at || compareCodepoints(a.id, b.id))
    .map((event) => ({ blob: event.content, author: event.pubkey, cursor: String(event.created_at) }));
}
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

export function nostrFetchFilter(
  tag: string,
  kind: number,
  opts: { author?: string; limit?: number; since?: number | null },
) {
  assertLowercaseGroupTag(tag);
  return {
    kinds: [kind],
    "#t": [tag],
    ...(opts.author ? { authors: [opts.author] } : {}),
    ...(opts.since ? { since: opts.since } : {}),
    limit: opts.limit ?? 500,
  };
}

export class NostrRelay implements Relay {
  name = "nostr";
  private pool = new SimplePool();
  private sk: Uint8Array;
  author: string;
  // REL-002: policy for THIS relay's OWN individual URLs, set by the caller
  // (sync.ts) before each publish/fetch so a backed-off/dropped URL is
  // skipped without the shared Relay interface needing to know anything
  // about per-endpoint concerns. Read back afterward via lastOutcomes() so
  // the caller can update the persisted policy for the next cycle -- one
  // bad URL's outcome never touches the others sharing this same adapter.
  policy: EndpointPolicyMap = {};
  private outcomes = new Map<string, { ok: boolean; reason?: string }>();

  constructor(secretHex?: string, readonly relayUrls = config.nostrRelays, private kind = config.nostrKind) {
    this.sk = secretFromHex(secretHex);
    this.author = getPublicKey(this.sk);
  }

  secretHex(): string {
    return bytesToHex(this.sk);
  }

  close(): void { this.pool.destroy(); }

  private request<T>(operation: () => Promise<T>, request?: RelayRequestOptions): Promise<T> {
    return withRequestDeadline(async (signal) => {
      const abort = () => this.pool.destroy();
      signal.addEventListener("abort", abort, { once: true });
      try { return await operation(); }
      finally { signal.removeEventListener("abort", abort); }
    }, request?.signal);
  }

  /** URLs not currently backed off or dropped per the caller-supplied policy. */
  private activeUrls(now = Date.now()): string[] {
    return this.relayUrls.filter((url) => isEndpointAvailable(this.policy[url], now));
  }

  /** Per-URL outcomes from the LAST publish call, for the caller to fold
   * into diagnostics and persist an updated policy. Empty after fetch(),
   * since nostr-tools' querySync does not expose per-URL query failures. */
  lastOutcomes(): Map<string, { ok: boolean; reason?: string }> {
    return this.outcomes;
  }

  async publish(tag: string, _author: string, blob: string, _writeProof?: string, request?: RelayRequestOptions): Promise<AckResult> {
    this.outcomes = new Map();
    const activeUrls = this.activeUrls();
    if (activeUrls.length === 0) return { ok: false, reason: "all nostr relays currently backed off or dropped" };
    try {
      return await this.request(async () => {
        const event = finalizeEvent(nostrEventTemplate(tag, blob, this.kind), this.sk);
        const pubs = this.pool.publish(activeUrls, event);
        const settled = await Promise.allSettled(pubs);
        settled.forEach((result, index) => {
          const url = activeUrls[index]!;
          this.outcomes.set(url, result.status === "fulfilled"
            ? { ok: true }
            : { ok: false, reason: result.reason instanceof Error ? result.reason.message : String(result.reason) });
        });
        const ok = settled.filter((result) => result.status === "fulfilled").length;
        return ok > 0 ? { ok: true, cursor: event.id } : { ok: false, reason: "no nostr relay accepted publish" };
      }, request);
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async fetch(tag: string, opts: { author?: string; cursor?: string | null; limit?: number }, request?: RelayRequestOptions): Promise<RelayEntry[]> {
    // The stored cursor on this relay kind is a created_at watermark (see RelayEntry).
    const since = opts.cursor ? Number(opts.cursor) : null;
    const filter = nostrFetchFilter(tag, this.kind, { ...opts, since });
    const activeUrls = this.activeUrls();
    const events = activeUrls.length === 0 ? [] : await this.request(() => this.pool.querySync(activeUrls, filter), request);
    return selectNostrEntries(events, { since });
  }

  async recoveryPage(url: string, tag: string, filter: { since: number; until: number; limit: number }, request?: RelayRequestOptions): Promise<RelayEntry[]> {
    if (!this.relayUrls.includes(url)) throw new Error("Unknown recovery relay");
    const query = { ...nostrFetchFilter(tag, this.kind, filter), since: filter.since, until: filter.until };
    return fetchNostrRecoveryPage(url, query, request);
  }
}
