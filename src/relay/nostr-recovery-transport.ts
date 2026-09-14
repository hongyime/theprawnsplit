import { verifyEvent, type Event as NostrEvent } from "nostr-tools";
import { withRequestDeadline } from "./request-deadline";
import type { RelayEntry, RelayRequestOptions } from "./types";

/** Slice the third value of an already parsed JSON frame. Re-serializing loses
 * unknown numeric spellings, duplicate keys and the original escape sequences. */
function eventObjectJson(frame: string): string {
  let depth = 0, quoted = false, escaped = false, commas = 0, start = -1;
  for (let index = 0; index < frame.length; index += 1) {
    const char = frame[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === "[" || char === "{") depth += 1;
    if (char === "]" || char === "}") {
      if (depth === 1 && start >= 0) return frame.slice(start, index).trim();
      depth -= 1;
    }
    if (char === "," && depth === 1) {
      if (++commas === 2) start = index + 1;
      else if (start >= 0) return frame.slice(start, index).trim();
    }
  }
  throw new Error("Missing signed recovery object");
}

/** Recovery needs an actual wire EOSE. SimplePool.querySync also resolves after
 * connection failure/timeouts, so an empty result there cannot close a scan. */
export function fetchNostrRecoveryPage(url: string,
  filter: { kinds: number[]; "#t": string[]; since: number; until: number; limit: number }, request?: RelayRequestOptions): Promise<RelayEntry[]> {
  return withRequestDeadline(async (signal) => new Promise<RelayEntry[]>((resolve, reject) => {
    const socket = new WebSocket(url);
    const requestId = `recovery-${crypto.randomUUID()}`;
    const events = new Map<string, { event: NostrEvent; raw: string }>();
    let bytes = 0, messages = 0, done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", abort);
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(["CLOSE", requestId])); } catch { /* Already disconnected. */ }
      try { socket.close(); } catch { /* The deadline still settles the request. */ }
      if (error) reject(error);
      else resolve([...events.values()].sort((a, b) => a.event.created_at - b.event.created_at || a.event.id.localeCompare(b.event.id))
        .map(({ event, raw }) => ({ cursor: String(event.created_at), author: event.pubkey, blob: event.content, sourceEventJson: raw })));
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
        const raw = eventObjectJson(message.data);
        // Same signature with different unsigned extension fields is still
        // distinct source data. Only exact repeated objects are deduplicated.
        events.set(raw, { event, raw });
        if (events.size > filter.limit) throw new Error("Nostr recovery page limit reached");
      } catch { finish(new Error("Nostr recovery was not verified; checkpoint retained")); }
    };
  }), request?.signal);
}
