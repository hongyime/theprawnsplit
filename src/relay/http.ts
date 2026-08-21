import { config } from "@/config";
import type { AckResult, Relay, RelayEntry } from "./types";

export class HttpRelay implements Relay {
  name = "operated";

  constructor(private endpoint = config.relayEndpoint) {}

  async publish(tag: string, author: string, blob: string, writeProof: string): Promise<AckResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag, author, blob, writeProof }),
    });
    if (!response.ok) return { ok: false, reason: await response.text() };
    const body = (await response.json()) as { cursor?: string };
    return body.cursor ? { ok: true, cursor: body.cursor } : { ok: true };
  }

  async fetch(tag: string, opts: { author?: string; cursor?: string | null; limit?: number }): Promise<RelayEntry[]> {
    const url = new URL(this.endpoint, window.location.origin);
    url.searchParams.set("tag", tag);
    if (opts.cursor) url.searchParams.set("cursor", opts.cursor);
    if (opts.author) url.searchParams.set("author", opts.author);
    if (opts.limit) url.searchParams.set("limit", String(opts.limit));
    const response = await fetch(url);
    if (!response.ok) throw new Error(await response.text());
    const body = (await response.json()) as { entries?: RelayEntry[] };
    return body.entries ?? [];
  }
}
