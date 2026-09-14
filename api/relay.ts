import { Redis } from "@upstash/redis";
import { SupabaseRelayStore, validRedisCursor } from "../server/supabase-relay";

export const config = { runtime: "edge" };

const TAG_RE = /^[0-9a-f]{64}$/;
const WRITE_PROOF_RE = /^[0-9a-f]{64}$/;
const MAX_BLOB = parseRelayNumericLimit(process.env.RELAY_MAX_BLOB_BYTES, 131_072);
const MAX_LIMIT = parseRelayNumericLimit(process.env.RELAY_MAX_FETCH_LIMIT, 500);

const streamKey = (tag: string): string => `ts:${tag}`;
const proofKey = (tag: string): string => `tp:${tag}`;

interface RelayStore {
  get<TData>(key: string): Promise<TData | null>;
  setnx<TData>(key: string, value: TData): Promise<number>;
}

function redis(): Redis {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("relay storage is not configured");
  }
  return Redis.fromEnv();
}

function supabase(): SupabaseRelayStore | null {
  const backend = process.env.PRAWNSPLIT_RELAY_BACKEND ?? "upstash";
  if (backend === "upstash") return null;
  if (backend !== "supabase") throw new Error("invalid relay storage configuration");
  return new SupabaseRelayStore(process.env.PRAWNSPLIT_SUPABASE_URL, process.env.PRAWNSPLIT_SUPABASE_SECRET_KEY);
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const bad = (message: string, status = 400): Response => json({ error: message }, status);

export function parseRelayNumericLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidWriteProof(writeProof: string): boolean {
  return WRITE_PROOF_RE.test(writeProof);
}

export async function writeProofCommitment(writeProof: string): Promise<string> {
  const input = new TextEncoder().encode(`relay-write-proof:${writeProof}`);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
}

export async function verifyRelayWriteProof(store: RelayStore, tag: string, writeProof: string): Promise<boolean> {
  if (!isValidWriteProof(writeProof)) return false;
  const key = proofKey(tag);
  const commitment = await writeProofCommitment(writeProof);
  const claimed = await store.setnx(key, commitment);
  if (claimed === 1) return true;
  return (await store.get<string>(key)) === commitment;
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed) || parsed < 1) return 100;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);

    // Deployment configuration is the cutover authority. Never infer a completed
    // migration merely from credentials being present. No database read is needed.
    const phase = process.env.PRAWNSPLIT_RELAY_MIGRATION ?? "legacy";
    const backend = process.env.PRAWNSPLIT_RELAY_BACKEND ?? "upstash";
    if (!["legacy", "paused", "supabase-v1"].includes(phase)) return bad("invalid relay storage configuration", 503);
    if (!["upstash", "supabase"].includes(backend) || (phase === "legacy" && backend !== "upstash") ||
        (phase === "supabase-v1" && backend !== "supabase")) return bad("invalid relay storage configuration", 503);
    if (req.method === "GET" && url.searchParams.get("capabilities") === "1") {
      const response = json({ protocol: 1, mode: phase, generation: phase === "supabase-v1" ? "supabase-v1" : null });
      response.headers.set("cache-control", "no-store");
      return response;
    }

    if (req.method === "POST") {
      if (phase === "paused") return bad("relay migration temporarily pauses writes; retry later", 503);
      let parsed: unknown;
      try { parsed = await req.json(); } catch { return bad("invalid request body"); }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return bad("invalid request body");
      const body = parsed as { tag?: string; blob?: string; author?: string; writeProof?: string };
      const tag = body.tag ?? "";
      if (!TAG_RE.test(tag)) return bad("invalid tag");
      if (typeof body.blob !== "string" || body.blob.length === 0 || new TextEncoder().encode(body.blob).byteLength > MAX_BLOB) return bad("invalid blob");
      if (typeof body.author !== "string" || body.author.length === 0 || body.author.length > 128) return bad("invalid author");
      if (typeof body.writeProof !== "string" || !isValidWriteProof(body.writeProof)) return bad("invalid proof");

      const destination = supabase();
      if (destination) {
        const cursor = await destination.append(tag, await writeProofCommitment(body.writeProof), body.blob, body.author);
        return cursor === null ? bad("invalid proof", 403) : json({ cursor });
      }
      const store = redis();
      if (!(await verifyRelayWriteProof(store, tag, body.writeProof))) return bad("invalid proof", 403);

      const cursor = await store.xadd(streamKey(tag), "*", {
        blob: body.blob,
        author: body.author,
      });
      return json({ cursor });
    }

    if (req.method === "GET") {
      const tag = url.searchParams.get("tag") ?? "";
      if (!TAG_RE.test(tag)) return bad("invalid tag");

      const cursor = url.searchParams.get("cursor");
      const author = url.searchParams.get("author");
      const destination = supabase();
      if (destination) {
        if (cursor && !validRedisCursor(cursor)) return bad("invalid cursor");
        return json({ entries: await destination.read(tag, cursor, parseLimit(url.searchParams.get("limit")), author) });
      }
      const rows = await redis().xrange<{ blob?: string; author?: string }>(
        streamKey(tag),
        cursor ? `(${cursor}` : "-",
        "+",
        parseLimit(url.searchParams.get("limit")),
      );
      let entries = Object.entries(rows).flatMap(([entryCursor, fields]) =>
        typeof fields.blob === "string" && typeof fields.author === "string"
          ? [{ cursor: entryCursor, blob: fields.blob, author: fields.author }]
          : [],
      );
      if (author) entries = entries.filter((entry) => entry.author === author);
      return json({ entries });
    }

    return bad("method not allowed", 405);
  } catch (error) {
    // Only fixed local configuration messages are safe to expose. Provider errors
    // can contain endpoint names, credentials or database details.
    const message = error instanceof Error ? error.message : "";
    const safe = message === "relay storage is not configured" || message === "invalid relay storage configuration";
    return bad(safe ? message : "relay storage unavailable", 503);
  }
}
