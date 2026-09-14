import { verifyEvent, type Event as NostrEvent } from "nostr-tools";
import { withRequestDeadline } from "./request-deadline";
import type { RelayEntry, RelayRequestOptions } from "./types";

/** Recovery needs an actual wire EOSE. SimplePool.querySync also resolves after
 * connection failure/timeouts, so an empty result there cannot close a scan. */
export function fetchNostrRecoveryPage(url: string,
  filter: { kinds: number[]; "#t": string[]; since: number; until: number; limit: number }, request?: RelayRequestOptions): Promise<RelayEntry[]> {
  return withRequestDeadline(async (signal) => new Promise<RelayEntry[]>((resolve, reject) => {
    const socket = new WebSocket(url);
    const requestId = `recovery-${crypto.randomUUID()}`;
    const events = new Map<string, NostrEvent>();
    let bytes = 0, messages = 0, done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", abort);
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(["CLOSE", requestId])); } catch { /* Already disconnected. */ }
      try { socket.close(); } catch { /* The deadline still settles the request. */ }
      if (error) reject(error);
      else resolve([...events.values()].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))
        .map((event) => ({ cursor: String(event.created_at), author: event.pubkey, blob: event.content })));
    };
    const abort = () => finish(new Error("Nostr recovery timed out; checkpoint retained"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    socket.onopen = () => socket.send(JSON.stringify(["REQ", requestId, filter]));
    socket.onerror = () => finish(new Error("Nostr recovery unavailable; checkpoint retained"));
    socket.onclose = () => finish(new Error("Nostr closed before completing recovery; checkpoint retained"));
    socket.onmessage = (message) => {
      try {
        if (typeof message.data !== "string") throw new Error("Invalid Nostr recovery message");
        bytes += new TextEncoder().encode(message.data).byteLength;
        if (bytes > 2_100_000 || ++messages > filter.limit * 2 + 10) throw new Error("Nostr recovery transfer limit reached");
        const frame: unknown = JSON.parse(message.data);
        if (!Array.isArray(frame)) throw new Error("Invalid Nostr recovery message");
        if (frame[1] !== requestId) return;
        if (frame[0] === "EOSE") { finish(); return; }
        if (frame[0] === "CLOSED") throw new Error("Nostr rejected recovery; checkpoint retained");
        if (frame[0] !== "EVENT") return;
        const event = frame[2] as NostrEvent;
        if (!event || !verifyEvent(event) || !filter.kinds.includes(event.kind) ||
            !event.tags.some(([name, tag]) => name === "t" && filter["#t"].includes(tag!)) ||
            event.created_at < filter.since || event.created_at > filter.until) {
          throw new Error("Invalid signed Nostr recovery event; checkpoint retained");
        }
        events.set(event.id, event);
        if (events.size > filter.limit) throw new Error("Nostr recovery page limit reached");
      } catch { finish(new Error("Nostr recovery was not verified; checkpoint retained")); }
    };
  }), request?.signal);
}
