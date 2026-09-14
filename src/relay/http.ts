import { config } from "@/config";
import type { AckResult, Relay, RelayEntry, RelayRequestOptions } from "./types";
import { withRequestDeadline } from "./request-deadline";
import { parseMigrationMode, type MigrationMode } from "./migration-mode";
import { boundedText } from "./bounded-body";

export class HttpRelay implements Relay {
  name = "operated";

  constructor(readonly endpoint = config.relayEndpoint) {}

  async migrationMode(request?: RelayRequestOptions): Promise<MigrationMode> {
    const url = new URL(this.endpoint, window.location.origin);
    url.searchParams.set("capabilities", "1");
    return withRequestDeadline(async (signal) => {
      const response = await fetch(url, { signal, cache: "no-store", redirect: "error" });
      if (!response.ok) throw new Error("Unable to verify relay migration status; local changes will retry");
      const text = await boundedText(response.body, 1024);
      return parseMigrationMode(JSON.parse(text));
    }, request?.signal);
  }

  async publish(tag: string, author: string, blob: string, writeProof: string, request?: RelayRequestOptions): Promise<AckResult> {
    return withRequestDeadline(async (signal) => {
      const response = await fetch(this.endpoint, {
        signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag, author, blob, writeProof }),
      });
      if (!response.ok) return { ok: false, reason: await boundedText(response.body, 1024) };
      const body = JSON.parse(await boundedText(response.body, 1024)) as { cursor?: string };
      return body.cursor ? { ok: true, cursor: body.cursor } : { ok: true };
    }, request?.signal);
  }

  async fetch(tag: string, opts: { author?: string; cursor?: string | null; limit?: number }, request?: RelayRequestOptions): Promise<RelayEntry[]> {
    const url = new URL(this.endpoint, window.location.origin);
    url.searchParams.set("tag", tag);
    if (opts.cursor) url.searchParams.set("cursor", opts.cursor);
    if (opts.author) url.searchParams.set("author", opts.author);
    if (opts.limit) url.searchParams.set("limit", String(opts.limit));
    return withRequestDeadline(async (signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(await boundedText(response.body, 1024));
      const body = JSON.parse(await boundedText(response.body, 2_100_000)) as { entries?: RelayEntry[] };
      if (!Array.isArray(body.entries) || body.entries.length > 500 || body.entries.some((entry) =>
        !entry || typeof entry.blob !== "string" || typeof entry.author !== "string" || typeof entry.cursor !== "string")) {
        throw new Error("Invalid relay history response");
      }
      return body.entries;
    }, request?.signal);
  }
}
